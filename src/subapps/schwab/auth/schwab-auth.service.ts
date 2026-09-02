import { HttpService } from '@nestjs/axios';
import {
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

  constructor(
    @InjectRepository(SchwabToken)
    private readonly tokenRepository: Repository<SchwabToken>,
    private readonly httpService: HttpService,
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

    await this.persistTokenResponse(tokenResponse);

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
      await this.refreshAccessToken(token);
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
      return this.refreshAccessToken(token);
    }

    const accessToken = decryptToken(
      token.accessToken,
      this.config.tokenEncryptionKey,
    );
    this.cacheAccessToken(accessToken, token.accessTokenExpiresAt);
    return accessToken;
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
        accountHash: this.config.accountHash || null,
      };
    }
    return {
      connected: token.refreshTokenExpiresAt.getTime() > Date.now(),
      expiresAt: token.accessTokenExpiresAt.toISOString(),
      accountHash: this.config.accountHash || null,
    };
  }

  /** This table holds a single personal-account row; fetch it without
   * relying on TypeORM's empty-where matching semantics. */
  private async getTokenRow(): Promise<SchwabToken | null> {
    const [token] = await this.tokenRepository.find({ take: 1 });
    return token ?? null;
  }

  private async refreshAccessToken(token: SchwabToken): Promise<string> {
    const refreshToken = decryptToken(
      token.refreshToken,
      this.config.tokenEncryptionKey,
    );

    const tokenResponse = await this.requestToken({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    await this.persistTokenResponse(tokenResponse, token.id);
    return tokenResponse.access_token;
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
