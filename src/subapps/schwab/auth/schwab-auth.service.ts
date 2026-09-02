import { HttpService } from '@nestjs/axios';
import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, createHash } from 'crypto';
import { firstValueFrom } from 'rxjs';
import { Repository } from 'typeorm';

import schwabConfig from '@schwab/config/schwab.config';
import { OrdersService } from '@schwab/orders/orders.service';

import { SchwabToken } from './entities/schwab-token.entity';
import { decryptToken, encryptToken } from './token-encryption.util';

interface StatePayload {
  codeVerifier: string;
  exp: number;
  /** Overrides `config.redirectSuccessUrl` for this one flow - used by web
   * clients that can't handle an Expo deep link (see `returnTo` handling
   * in `buildAuthorizationUrl`/`decodeState`). */
  returnTo?: string;
}

interface SchwabTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
/** How long a user has to complete the Schwab login/consent screen before
 * the `state` round-trip is rejected as expired. */
const PENDING_AUTHORIZATION_TTL_MS = 10 * 60 * 1000;

/** Expo/dev-client deep link schemes that don't need to appear in
 * ALLOWED_ORIGINS (that env var is for browser CORS, which doesn't apply
 * to these custom schemes at all). */
const RETURN_TO_ALLOWED_SCHEMES = new Set(['exp:', 'myapp:']);

@Injectable()
export class SchwabAuthService {
  private readonly logger = new Logger(SchwabAuthService.name);
  private cachedAccessToken: { value: string; expiresAt: number } | null = null;
  /** Single-flight guard — see `refreshAccessTokenOnce` for why this exists. */
  private refreshPromise: Promise<string> | null = null;
  private cachedAccountHash: string | null = null;

  constructor(
    @InjectRepository(SchwabToken)
    private readonly tokenRepository: Repository<SchwabToken>,
    private readonly httpService: HttpService,
    @Inject(forwardRef(() => OrdersService))
    private readonly ordersService: OrdersService,
    @Inject(schwabConfig.KEY)
    private readonly config: ConfigType<typeof schwabConfig>,
  ) {}

  /**
   * The PKCE `code_verifier` + expiry are packed into the `state` param
   * itself (AES-256-GCM encrypted) rather than kept in an in-memory map, so
   * the flow survives dyno restarts/redeploys between `/connect` and
   * `/callback` (Heroku config changes, cycling, etc. would otherwise wipe a
   * server-side pending-authorization store mid-flow).
   */
  /**
   * `returnTo` lets a web client (Expo web, browser tab - anywhere the
   * Expo deep link scheme can't be handled) override where `/auth/callback`
   * redirects to on success, instead of the configured
   * `SCHWAB_REDIRECT_SUCCESS_URL` deep link. Validated against
   * `ALLOWED_ORIGINS`/`ALLOWED_ORIGINS_DEVELOPMENT` (same allowlist used for
   * CORS) plus the `exp://`/`myapp://` custom schemes, so this can't be
   * used as an open redirect to an arbitrary host.
   */
  buildAuthorizationUrl(returnTo?: string): string {
    if (returnTo && !this.isAllowedReturnTo(returnTo)) {
      throw new UnauthorizedException(
        `returnTo "${returnTo}" is not an allowed redirect target`,
      );
    }

    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    const statePayload: StatePayload = {
      codeVerifier,
      exp: Date.now() + PENDING_AUTHORIZATION_TTL_MS,
      returnTo,
    };
    const state = encryptToken(
      JSON.stringify(statePayload),
      this.config.tokenEncryptionKey,
    );

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return `${this.config.authorizeUrl}?${params.toString()}`;
  }

  /** Returns the URL the controller should redirect the browser to on
   * success: the flow's `returnTo` override if one was set, else the
   * configured `SCHWAB_REDIRECT_SUCCESS_URL` deep link. */
  async handleCallback(code: string, state: string): Promise<string> {
    const pending = this.decodeState(state);

    const tokenResponse = await this.requestToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
      code_verifier: pending.codeVerifier,
    });

    // Reuse the existing single row's id (if any) instead of blindly
    // inserting a fresh one. Without this, re-running the connect flow
    // (e.g. to fix a dead/revoked refresh token) leaves the *old* row
    // behind, and `getTokenRow()`'s single-row assumption breaks: a later
    // refresh could read the stale orphaned row and redeem an
    // already-invalid refresh_token, which is exactly what happened in
    // production (see `refreshAccessTokenOnce`).
    const existing = await this.getTokenRow();
    await this.persistTokenResponse(tokenResponse, existing?.id);

    return pending.returnTo || this.config.redirectSuccessUrl;
  }

  private isAllowedReturnTo(url: string): boolean {
    try {
      const parsed = new URL(url);
      if (RETURN_TO_ALLOWED_SCHEMES.has(parsed.protocol)) {
        return true;
      }

      const allowedOrigins = [
        ...(process.env.ALLOWED_ORIGINS?.split(',') ?? []),
        ...(process.env.ALLOWED_ORIGINS_DEVELOPMENT?.split(',') ?? []),
      ].map((origin) => origin.trim());

      return allowedOrigins.includes(parsed.origin);
    } catch {
      return false;
    }
  }

  private decodeState(state: string): StatePayload {
    let payload: StatePayload;
    try {
      payload = JSON.parse(decryptToken(state, this.config.tokenEncryptionKey));
    } catch {
      throw new UnauthorizedException(
        'Unknown or expired OAuth state parameter',
      );
    }

    if (!payload?.codeVerifier || payload.exp < Date.now()) {
      throw new UnauthorizedException(
        'Unknown or expired OAuth state parameter',
      );
    }

    return payload;
  }

  /**
   * Runs every 10 minutes; proactively rotates the access token once it's
   * within 5 minutes of expiring so order/streaming calls never hit a live
   * 401 mid-trade.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async proactivelyRefreshIfNearExpiry(): Promise<void> {
    const token = await this.getTokenRow();
    if (!token) {
      return;
    }

    const msUntilExpiry = token.accessTokenExpiresAt.getTime() - Date.now();
    if (msUntilExpiry > this.config.refreshBufferSeconds * 1000) {
      return;
    }

    try {
      await this.refreshAccessTokenOnce(token);
      this.logger.log('Proactively refreshed Schwab access token');
    } catch (err) {
      this.logger.error(
        'Failed to proactively refresh Schwab access token',
        err?.response?.data || err.message,
      );
    }
  }

  async getValidAccessToken(): Promise<string> {
    if (
      this.cachedAccessToken &&
      this.cachedAccessToken.expiresAt > Date.now()
    ) {
      return this.cachedAccessToken.value;
    }

    const token = await this.getTokenRow();
    if (!token) {
      throw new UnauthorizedException(
        'Schwab account is not connected yet. Visit /auth/connect first.',
      );
    }

    const msUntilExpiry = token.accessTokenExpiresAt.getTime() - Date.now();
    if (msUntilExpiry <= this.config.refreshBufferSeconds * 1000) {
      return this.refreshAccessTokenOnce(token);
    }

    const accessToken = decryptToken(
      token.accessToken,
      this.config.tokenEncryptionKey,
    );
    this.cacheAccessToken(accessToken, token.accessTokenExpiresAt);
    return accessToken;
  }

  /**
   * Ensures only one `grant_type=refresh_token` call to Schwab is ever in
   * flight at a time. `getValidAccessToken()` is called independently by
   * every outgoing Schwab HTTP request (the Bearer interceptor in
   * `SchwabHttpModule`, on a ~4s poll from `AccountSnapshotService` alone)
   * *and* by the raw WS streamer's reconnect path, with no coordination
   * between them. Without this guard, two callers landing in the same
   * near-expiry window would each redeem the *same* refresh_token
   * concurrently — Schwab (like most OAuth providers) rotates the refresh
   * token on every use and revokes the whole token family if it detects the
   * same one reused, which is almost certainly what silently killed the
   * connection in production: every refresh after that point fails with
   * `invalid_grant` and the user has to reconnect from scratch.
   */
  private async refreshAccessTokenOnce(token: SchwabToken): Promise<string> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.refreshAccessToken(token).finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }

  async getConnectionStatus(): Promise<{
    connected: boolean;
    expiresAt: string | null;
    accountHash: string | null;
  }> {
    const token = await this.getTokenRow();
    if (!token) {
      return {
        connected: false,
        expiresAt: null,
        accountHash: null,
      };
    }
    return {
      connected: token.refreshTokenExpiresAt.getTime() > Date.now(),
      expiresAt: token.accessTokenExpiresAt.toISOString(),
      accountHash: await this.resolveAccountHash(),
    };
  }

  /** Same rationale as `AccountSnapshotService.resolveAccountHash`: there's
   * no per-request caller to supply this on a status-check endpoint, so it's
   * resolved once via `/accounts/accountNumbers` and cached, rather than
   * relying on the optional (usually unset) `SCHWAB_ACCOUNT_HASH` config
   * var. Returns `null` rather than throwing if Schwab isn't connected or
   * the lookup fails, since this is best-effort metadata on a status
   * endpoint, not something that should break `/auth/status` itself. */
  private async resolveAccountHash(): Promise<string | null> {
    if (this.config.accountHash) return this.config.accountHash;
    if (this.cachedAccountHash) return this.cachedAccountHash;

    try {
      const accounts = await this.ordersService.listAccounts();
      if (!accounts.length) return null;
      this.cachedAccountHash = accounts[0].hashValue;
      return this.cachedAccountHash;
    } catch {
      return null;
    }
  }

  /** This table is meant to hold a single personal-account row. Order by
   * most-recently-updated so that if a duplicate ever slips in (see
   * `persistTokenResponse`'s upsert-by-existing-id fix), we always operate
   * on the freshest credentials instead of whichever row Postgres happens
   * to return first with no `ORDER BY`. */
  private async getTokenRow(): Promise<SchwabToken | null> {
    const [token] = await this.tokenRepository.find({
      take: 1,
      order: { updatedAt: 'DESC' },
    });
    return token ?? null;
  }

  private async refreshAccessToken(token: SchwabToken): Promise<string> {
    const refreshToken = decryptToken(
      token.refreshToken,
      this.config.tokenEncryptionKey,
    );

    try {
      const tokenResponse = await this.requestToken({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      });

      await this.persistTokenResponse(tokenResponse, token.id);
      return tokenResponse.access_token;
    } catch (err) {
      if (err?.response?.data?.error === 'invalid_grant') {
        // Refresh token is permanently dead (revoked/reused/expired) —
        // nothing will make a subsequent refresh succeed. Clear the row so
        // `/auth/status` stops reporting a stale "connected: true" for up
        // to 7 more days and the user is clearly prompted to reconnect via
        // /auth/connect instead of silently getting no live data.
        await this.tokenRepository.delete({ id: token.id });
        this.cachedAccessToken = null;
        this.cachedAccountHash = null;
        this.logger.error(
          'Schwab refresh token was rejected as invalid/revoked — cleared stored token, user must reconnect via /auth/connect',
        );
      }
      throw err;
    }
  }

  private async requestToken(
    body: Record<string, string>,
  ): Promise<SchwabTokenResponse> {
    const basicAuth = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
    ).toString('base64');

    const response = await firstValueFrom(
      this.httpService.post<SchwabTokenResponse>(
        this.config.tokenUrl,
        new URLSearchParams(body).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${basicAuth}`,
          },
        },
      ),
    );

    return response.data;
  }

  private async persistTokenResponse(
    tokenResponse: SchwabTokenResponse,
    existingId?: string,
  ): Promise<void> {
    const now = Date.now();
    const accessTokenExpiresAt = new Date(
      now + tokenResponse.expires_in * 1000,
    );
    const refreshTokenExpiresAt = new Date(
      now + REFRESH_TOKEN_TTL_SECONDS * 1000,
    );

    const encryptedAccessToken = encryptToken(
      tokenResponse.access_token,
      this.config.tokenEncryptionKey,
    );
    const encryptedRefreshToken = encryptToken(
      tokenResponse.refresh_token,
      this.config.tokenEncryptionKey,
    );

    await this.tokenRepository.save({
      id: existingId,
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    });

    this.cacheAccessToken(tokenResponse.access_token, accessTokenExpiresAt);
  }

  private cacheAccessToken(value: string, expiresAt: Date): void {
    this.cachedAccessToken = { value, expiresAt: expiresAt.getTime() };
  }
}
