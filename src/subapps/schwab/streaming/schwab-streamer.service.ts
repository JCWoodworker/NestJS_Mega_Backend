import { HttpService } from '@nestjs/axios';
import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import * as WebSocket from 'ws';

import { SchwabAuthService } from '@schwab/auth/schwab-auth.service';
import schwabConfig from '@schwab/config/schwab.config';

import {
  LEVEL_ONE_EQUITY_FIELD_KEYS,
  LEVEL_ONE_EQUITY_FIELDS,
  LEVEL_ONE_OPTIONS_FIELD_KEYS,
} from './level-one-fields';
import { OptionsGateway } from './options.gateway';
import { buildOsiSymbol } from './osi-symbol.util';

interface StreamerInfo {
  streamerSocketUrl: string;
  schwabClientCustomerId: string;
  schwabClientCorrelId: string;
  schwabClientChannel: string;
  schwabClientFunctionId: string;
}

const RECONNECT_DELAY_MS = 2000;
const HEARTBEAT_CHECK_INTERVAL_MS = 5000;
const CONNECT_RETRY_WHEN_UNAUTHENTICATED_MS = 30000;

export interface SwitchUnderlyingResult {
  status: 'ok' | 'error';
  symbol: string;
  message?: string;
}

/**
 * Underlyings the ladder can re-center around via the `subscribe-underlying`
 * socket event. SPX/SPXW are listed but flagged as unverified: Schwab's
 * index quotes may need a different streamer service than
 * `LEVELONE_EQUITIES` (which is documented for equities/ETFs) - confirm
 * against a live account before relying on SPX/SPXW underlying price ticks.
 */
const SUPPORTED_UNDERLYINGS = new Set(['SPY', 'QQQ', 'IWM', 'SPX', 'SPXW']);
/** 0DTE SPX options trade under the SPXW root, not SPX. */
const OPTION_ROOT_OVERRIDES: Record<string, string> = { SPX: 'SPXW' };
const STRIKE_INCREMENT_OVERRIDES: Record<string, number> = {
  SPX: 5,
  SPXW: 5,
};

/**
 * Owns the raw connection to Schwab's LEVELONE streamer: login handshake,
 * heartbeat watchdog, subscription churn for the dynamic strike ladder, and
 * throttled relay of ticks to OptionsGateway. The frontend never talks to
 * this socket directly.
 *
 * NOTE: Schwab's streamer login payload/field semantics here follow the
 * publicly documented Streamer Guide; validate against a live account
 * before trading real money, since this hasn't been exercised against
 * Schwab's production streamer in this environment.
 */
@Injectable()
export class SchwabStreamerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchwabStreamerService.name);

  private socket: WebSocket | null = null;
  private streamerInfo: StreamerInfo | null = null;
  private requestId = 1;
  private loggedIn = false;

  private lastFrameAt: number | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private flushTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private destroyed = false;

  private underlyingSymbol = 'SPY';
  private optionRoot = 'SPY';
  private strikeIncrement = 1;

  private centerStrike: number | null = null;
  private currentWindowSymbols = new Set<string>();
  private pendingOptionTicks: Array<Record<string, unknown>> = [];
  private pendingUnderlyingPrice: number | null = null;

  constructor(
    private readonly httpService: HttpService,
    private readonly authService: SchwabAuthService,
    @Inject(forwardRef(() => OptionsGateway))
    private readonly optionsGateway: OptionsGateway,
    @Inject(schwabConfig.KEY)
    private readonly config: ConfigType<typeof schwabConfig>,
  ) {}

  onModuleInit(): void {
    this.flushTimer = setInterval(
      () => this.flushBufferedUpdates(),
      this.config.tickEmitThrottleMs,
    );
    void this.connect();
  }

  onModuleDestroy(): void {
    this.destroyed = true;
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
  }

  private async connect(): Promise<void> {
    if (this.destroyed) return;

    try {
      const accessToken = await this.authService.getValidAccessToken();
      this.streamerInfo = await this.fetchStreamerInfo();
      this.openSocket(accessToken);
    } catch (err) {
      this.logger.warn(
        `Schwab streamer not started yet (${err.message}); retrying in ${
          CONNECT_RETRY_WHEN_UNAUTHENTICATED_MS / 1000
        }s`,
      );
      this.scheduleReconnect(CONNECT_RETRY_WHEN_UNAUTHENTICATED_MS);
    }
  }

  private async fetchStreamerInfo(): Promise<StreamerInfo> {
    const response = await firstValueFrom(
      this.httpService.get('/trader/v1/userPreference'),
    );
    const streamerInfo = response.data?.streamerInfo?.[0];
    if (!streamerInfo) {
      throw new Error('Schwab userPreference response missing streamerInfo');
    }
    // TEMPORARY: confirm the exact keys/values Schwab's userPreference
    // endpoint actually returns, in case our StreamerInfo interface's field
    // names don't match Schwab's real response shape. No token/secret data
    // in this payload. Remove once the SUBS "Bad command formatting" bug is
    // resolved.
    this.logger.debug(
      `[TEMP DEBUG] streamerInfo raw: ${JSON.stringify(streamerInfo)}`,
    );
    return streamerInfo;
  }

  private openSocket(accessToken: string): void {
    this.logger.log(
      `Opening Schwab streamer socket to ${this.streamerInfo.streamerSocketUrl}`,
    );
    this.socket = new WebSocket(this.streamerInfo.streamerSocketUrl);

    this.socket.on('open', () => {
      this.logger.log('Schwab streamer socket opened, sending LOGIN');
      this.sendLoginRequest(accessToken);
    });
    this.socket.on('message', (raw) => this.handleMessage(raw.toString()));
    this.socket.on('close', (code, reasonBuf) => {
      this.logger.warn(
        `Schwab streamer socket closed: code=${code} reason="${reasonBuf?.toString()}" wasLoggedIn=${
          this.loggedIn
        } msSinceLastFrame=${
          this.lastFrameAt ? Date.now() - this.lastFrameAt : 'n/a'
        }`,
      );
      this.handleSocketClosed();
    });
    this.socket.on('error', (err) => {
      this.logger.error(
        `Schwab streamer socket error: ${err.message}`,
        err.stack,
      );
    });

    this.startHeartbeatWatchdog();
  }

  private sendLoginRequest(accessToken: string): void {
    this.sendRequest({
      service: 'ADMIN',
      command: 'LOGIN',
      requestid: this.nextRequestId(),
      parameters: {
        Authorization: accessToken,
        SchwabClientChannel: this.streamerInfo.schwabClientChannel,
        SchwabClientFunctionId: this.streamerInfo.schwabClientFunctionId,
      },
    });
  }

  private handleMessage(raw: string): void {
    this.lastFrameAt = Date.now();

    let payload: {
      response?: Array<Record<string, any>>;
      data?: Array<Record<string, any>>;
      notify?: Array<Record<string, any>>;
    };
    try {
      payload = JSON.parse(raw);
    } catch {
      this.logger.warn(`Received non-JSON frame from Schwab streamer: ${raw}`);
      return;
    }

    for (const response of payload.response ?? []) {
      if (response.command === 'LOGIN') {
        if (response.content?.code === 0) {
          this.onLoggedIn();
        } else {
          this.logger.error(
            `Schwab streamer LOGIN failed: ${JSON.stringify(response.content)}`,
          );
        }
      } else if (response.content?.code && response.content.code !== 0) {
        // Any non-zero code on a SUBS/UNSUBS response indicates Schwab
        // rejected that request - logging this is the main way to catch a
        // malformed subscription payload silently killing the connection.
        this.logger.error(
          `Schwab streamer ${response.service}/${
            response.command
          } error: ${JSON.stringify(response.content)}`,
        );
      }
    }

    // ADMIN notifications (e.g. a server-initiated logoff/kick) show up here,
    // not in `response` - logging these is critical to diagnosing an
    // unexpected disconnect that isn't a plain socket "close".
    for (const notification of payload.notify ?? []) {
      if (notification.heartbeat === undefined) {
        this.logger.warn(
          `Schwab streamer notify: ${JSON.stringify(notification)}`,
        );
      }
    }

    for (const dataItem of payload.data ?? []) {
      if (dataItem.service === 'LEVELONE_EQUITIES') {
        this.handleEquityTicks(dataItem.content ?? []);
      } else if (dataItem.service === 'LEVELONE_OPTIONS') {
        this.pendingOptionTicks.push(...(dataItem.content ?? []));
      }
    }
  }

  private async onLoggedIn(): Promise<void> {
    this.loggedIn = true;
    this.logger.log('Schwab streamer LOGIN succeeded');
    this.optionsGateway.emitStreamStatus({
      connected: true,
      lastFrameAt: this.lastFrameAt,
    });

    this.sendRequest({
      service: 'LEVELONE_EQUITIES',
      command: 'SUBS',
      requestid: this.nextRequestId(),
      parameters: {
        keys: this.underlyingSymbol,
        fields: LEVEL_ONE_EQUITY_FIELD_KEYS,
      },
    });

    try {
      const initialPrice = await this.fetchInitialUnderlyingPrice();
      this.recenterLadder(initialPrice);
    } catch (err) {
      this.logger.error(
        `Failed to fetch initial ${this.underlyingSymbol} quote for ladder seed`,
        err.message,
      );
    }
  }

  private async fetchInitialUnderlyingPrice(): Promise<number> {
    const response = await firstValueFrom(
      this.httpService.get('/marketdata/v1/quotes', {
        params: { symbols: this.underlyingSymbol },
      }),
    );
    const quote = response.data?.[this.underlyingSymbol]?.quote;
    return quote?.lastPrice ?? quote?.mark ?? 0;
  }

  /**
   * Handles a frontend-requested underlying change (`subscribe-underlying`
   * socket event): unsubscribes the current equity quote + option ladder,
   * switches root/strike-increment, and resubscribes around the new
   * underlying's current price.
   */
  async switchUnderlying(
    requestedSymbol: string,
  ): Promise<SwitchUnderlyingResult> {
    const symbol = requestedSymbol?.toUpperCase()?.trim();
    if (!symbol || !SUPPORTED_UNDERLYINGS.has(symbol)) {
      return {
        status: 'error',
        symbol: requestedSymbol,
        message: `Unsupported underlying "${requestedSymbol}"`,
      };
    }

    if (symbol === this.underlyingSymbol) {
      return { status: 'ok', symbol };
    }

    if (!this.loggedIn) {
      return {
        status: 'error',
        symbol,
        message: 'Streamer not connected to Schwab yet',
      };
    }

    this.sendRequest({
      service: 'LEVELONE_EQUITIES',
      command: 'UNSUBS',
      requestid: this.nextRequestId(),
      parameters: { keys: this.underlyingSymbol },
    });
    if (this.currentWindowSymbols.size > 0) {
      this.sendRequest({
        service: 'LEVELONE_OPTIONS',
        command: 'UNSUBS',
        requestid: this.nextRequestId(),
        parameters: { keys: [...this.currentWindowSymbols].join(',') },
      });
    }

    this.underlyingSymbol = symbol;
    this.optionRoot = OPTION_ROOT_OVERRIDES[symbol] ?? symbol;
    this.strikeIncrement = STRIKE_INCREMENT_OVERRIDES[symbol] ?? 1;
    this.centerStrike = null;
    this.currentWindowSymbols = new Set();

    this.sendRequest({
      service: 'LEVELONE_EQUITIES',
      command: 'SUBS',
      requestid: this.nextRequestId(),
      parameters: {
        keys: this.underlyingSymbol,
        fields: LEVEL_ONE_EQUITY_FIELD_KEYS,
      },
    });

    try {
      const initialPrice = await this.fetchInitialUnderlyingPrice();
      this.recenterLadder(initialPrice);
    } catch (err) {
      this.logger.error(
        `Failed to fetch initial ${this.underlyingSymbol} quote after underlying switch`,
        err.message,
      );
    }

    return {
      status: 'ok',
      symbol,
      message:
        symbol === 'SPX' || symbol === 'SPXW'
          ? 'Index underlying price feed via LEVELONE_EQUITIES is unverified against live Schwab data - confirm before trading real money'
          : undefined,
    };
  }

  private handleEquityTicks(ticks: Array<Record<string, any>>): void {
    for (const tick of ticks) {
      const price = tick[LEVEL_ONE_EQUITY_FIELDS.LAST_PRICE];
      if (typeof price === 'number' && price > 0) {
        this.pendingUnderlyingPrice = price;
        this.recenterLadder(price);
      }
    }
  }

  /**
   * Re-centers the 16-strike (8 ITM / 8 OTM) window whenever the spot price
   * drifts more than one strike increment away from the current center,
   * diffing old vs. new symbol sets to issue minimal UNSUBS/SUBS calls.
   */
  private recenterLadder(spotPrice: number): void {
    const nearestStrike =
      Math.round(spotPrice / this.strikeIncrement) * this.strikeIncrement;

    if (
      this.centerStrike !== null &&
      Math.abs(nearestStrike - this.centerStrike) < this.strikeIncrement
    ) {
      return;
    }

    const expiration = new Date();
    const newSymbols = new Set<string>();
    for (let offset = -8; offset < 8; offset += 1) {
      const strike = nearestStrike + offset * this.strikeIncrement;
      newSymbols.add(
        buildOsiSymbol({
          root: this.optionRoot,
          expiration,
          right: 'C',
          strike,
        }),
      );
      newSymbols.add(
        buildOsiSymbol({
          root: this.optionRoot,
          expiration,
          right: 'P',
          strike,
        }),
      );
    }

    const toUnsub = [...this.currentWindowSymbols].filter(
      (s) => !newSymbols.has(s),
    );
    const toSub = [...newSymbols].filter(
      (s) => !this.currentWindowSymbols.has(s),
    );

    if (toUnsub.length > 0) {
      this.sendRequest({
        service: 'LEVELONE_OPTIONS',
        command: 'UNSUBS',
        requestid: this.nextRequestId(),
        parameters: { keys: toUnsub.join(',') },
      });
    }
    if (toSub.length > 0) {
      this.sendRequest({
        service: 'LEVELONE_OPTIONS',
        command: 'SUBS',
        requestid: this.nextRequestId(),
        parameters: {
          keys: toSub.join(','),
          fields: LEVEL_ONE_OPTIONS_FIELD_KEYS,
        },
      });
    }

    this.centerStrike = nearestStrike;
    this.currentWindowSymbols = newSymbols;
    this.optionsGateway.emitLadderRecentered({
      centerStrike: nearestStrike,
      symbols: [...newSymbols],
    });
  }

  private flushBufferedUpdates(): void {
    if (this.pendingOptionTicks.length > 0) {
      this.optionsGateway.emitOptionTicks(this.pendingOptionTicks);
      this.pendingOptionTicks = [];
    }
    if (this.pendingUnderlyingPrice !== null) {
      this.optionsGateway.emitUnderlyingPrice({
        symbol: this.underlyingSymbol,
        price: this.pendingUnderlyingPrice,
        timestamp: Date.now(),
      });
      this.pendingUnderlyingPrice = null;
    }
  }

  private startHeartbeatWatchdog(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    this.heartbeatTimer = setInterval(() => {
      if (
        this.lastFrameAt !== null &&
        Date.now() - this.lastFrameAt > this.config.heartbeatTimeoutMs
      ) {
        this.logger.warn(
          'No frames received from Schwab streamer within heartbeat window; forcing reconnect',
        );
        this.optionsGateway.emitStreamStatus({
          connected: false,
          lastFrameAt: this.lastFrameAt,
        });
        this.socket?.close();
      }
    }, HEARTBEAT_CHECK_INTERVAL_MS);
  }

  private handleSocketClosed(): void {
    this.loggedIn = false;
    this.optionsGateway.emitStreamStatus({
      connected: false,
      lastFrameAt: this.lastFrameAt,
    });
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.scheduleReconnect(RECONNECT_DELAY_MS);
  }

  private scheduleReconnect(delayMs: number): void {
    if (this.destroyed) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => void this.connect(), delayMs);
  }

  private sendRequest(request: Record<string, unknown>): void {
    // WebSocket.OPEN is a valid static on the `ws` class; the
    // import/namespace rule mis-resolves it for this CJS-interop import
    // style, so it's disabled just for this line.
    // eslint-disable-next-line import/namespace
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.logger.warn(
        `Dropped ${request.service}/${
          request.command
        } request: socket not open (readyState=${
          this.socket?.readyState ?? 'null'
        })`,
      );
      return;
    }
    // Schwab requires SchwabClientCustomerId/SchwabClientCorrelId on *every*
    // request, not just LOGIN - omitting them on SUBS/UNSUBS gets rejected
    // with `{"code":21,"msg":"Bad command formatting"}`, which Schwab
    // follows by closing the socket outright. That was the entire root
    // cause of the streamer connect→login→SUBS→kicked loop: LOGIN built its
    // own request object with these fields, but every other call went
    // through this shared helper without them. Centralizing it here means
    // no future caller can hit the same bug again.
    const fullRequest = {
      ...request,
      SchwabClientCustomerId: this.streamerInfo?.schwabClientCustomerId,
      SchwabClientCorrelId: this.streamerInfo?.schwabClientCorrelId,
    };

    // TEMPORARY: log the full outgoing frame (Authorization redacted) to
    // pin down exactly why Schwab is rejecting SUBS with "Bad command
    // formatting" - remove once resolved.
    this.logger.debug(
      `-> ${JSON.stringify(fullRequest, (key, value) =>
        key === 'Authorization' ? '<redacted>' : value,
      )}`,
    );
    this.socket.send(JSON.stringify({ requests: [fullRequest] }));
  }

  private nextRequestId(): string {
    return String(this.requestId++);
  }
}
