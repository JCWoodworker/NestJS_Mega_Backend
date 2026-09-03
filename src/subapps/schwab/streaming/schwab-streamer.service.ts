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
  CHART_EQUITY_FIELD_KEYS,
  CHART_EQUITY_FIELDS,
  CHART_OPTIONS_FIELD_KEYS,
  CHART_OPTIONS_FIELDS,
} from './chart-fields';
import {
  chunkArray,
  computeNearestStrike,
  OPTIONS_SUBSCRIBE_CHUNK_SIZE,
  shouldRecenterLadder,
} from './ladder-recenter.util';
import {
  LEVEL_ONE_EQUITY_FIELD_KEYS,
  LEVEL_ONE_EQUITY_FIELDS,
  LEVEL_ONE_OPTIONS_FIELD_KEYS,
} from './level-one-fields';
import { mapOptionTicks, OptionTick } from './option-tick.mapper';
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

/** `YYYYMMDD` key used to detect the 0DTE expiration date rolling over. */
function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

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

  /** Last equity price seen, independent of the throttled `pendingUnderlyingPrice`
   * buffer - used to force a same-price recenter on day rollover (see
   * `startHeartbeatWatchdog`) without waiting on the next actual tick. */
  private lastKnownSpotPrice: number | null = null;
  private centerStrike: number | null = null;
  /** `YYYYMMDD` key for the expiration date `currentWindowSymbols` was built
   * against - lets `recenterLadder` detect the day rolling over (0DTE
   * contracts expiring at today's close) even when the spot price hasn't
   * moved a full strike, which would otherwise leave the ladder subscribed
   * to yesterday's dead, already-expired symbols indefinitely. */
  private currentExpirationDateKey: string | null = null;
  private currentWindowSymbols = new Set<string>();
  private pendingOptionTicks: OptionTick[] = [];
  private pendingUnderlyingPrice: number | null = null;
  /** OSI symbol of the single tracked-option premium chart (`subscribe-
   * option-chart`, section 9b) - `null` when nothing is subscribed. */
  private optionChartSymbol: string | null = null;

  constructor(
    private readonly httpService: HttpService,
    private readonly authService: SchwabAuthService,
    @Inject(forwardRef(() => OptionsGateway))
    private readonly optionsGateway: OptionsGateway,
    @Inject(schwabConfig.KEY)
    private readonly config: ConfigType<typeof schwabConfig>,
  ) {}

  /**
   * Snapshot of current streamer state for a client that just connected -
   * without this, a client joining after the ladder already stabilized
   * would see no `ladder-recentered`/`stream-status` until the next actual
   * change, which could be a long wait (or look identical to the streamer
   * being broken, as in the original bug report).
   */
  getSnapshotForNewClient(): {
    streamStatus: { connected: boolean; lastFrameAt: number | null };
    ladder: { centerStrike: number; symbols: string[] } | null;
  } {
    return {
      streamStatus: { connected: this.loggedIn, lastFrameAt: this.lastFrameAt },
      ladder:
        this.centerStrike !== null
          ? {
              centerStrike: this.centerStrike,
              symbols: [...this.currentWindowSymbols],
            }
          : null,
    };
  }

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
        this.pendingOptionTicks.push(...mapOptionTicks(dataItem.content ?? []));
      } else if (dataItem.service === 'CHART_EQUITY') {
        this.handleChartEquityCandles(dataItem.content ?? []);
      } else if (dataItem.service === 'CHART_OPTIONS') {
        this.handleChartOptionCandles(dataItem.content ?? []);
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
    // Piggybacked per section 9b: the underlying's 1m candle stream starts
    // automatically alongside its quote stream, no separate client event.
    this.sendRequest({
      service: 'CHART_EQUITY',
      command: 'SUBS',
      requestid: this.nextRequestId(),
      parameters: {
        keys: this.underlyingSymbol,
        fields: CHART_EQUITY_FIELD_KEYS,
      },
    });

    // Schwab subscriptions don't survive a socket reconnect - re-arm the
    // tracked option chart (if any) here rather than relying on the client
    // to re-send `subscribe-option-chart`, mirroring how LEVELONE_EQUITIES/
    // CHART_EQUITY above are unconditionally re-subscribed on every login.
    if (this.optionChartSymbol) {
      this.sendRequest({
        service: 'CHART_OPTIONS',
        command: 'SUBS',
        requestid: this.nextRequestId(),
        parameters: {
          keys: this.optionChartSymbol,
          fields: CHART_OPTIONS_FIELD_KEYS,
        },
      });
    }

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
    this.sendRequest({
      service: 'CHART_EQUITY',
      command: 'UNSUBS',
      requestid: this.nextRequestId(),
      parameters: { keys: this.underlyingSymbol },
    });
    this.unsubscribeOptions([...this.currentWindowSymbols]);

    this.underlyingSymbol = symbol;
    this.optionRoot = OPTION_ROOT_OVERRIDES[symbol] ?? symbol;
    this.strikeIncrement = STRIKE_INCREMENT_OVERRIDES[symbol] ?? 1;
    this.centerStrike = null;
    this.currentExpirationDateKey = null;
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
    this.sendRequest({
      service: 'CHART_EQUITY',
      command: 'SUBS',
      requestid: this.nextRequestId(),
      parameters: {
        keys: this.underlyingSymbol,
        fields: CHART_EQUITY_FIELD_KEYS,
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

  /**
   * Starts/swaps/stops the single tracked-option premium chart stream
   * (`subscribe-option-chart`, section 9b) - shared across all connected
   * clients, last request wins, mirroring `switchUnderlying`'s pattern.
   * Independent of the underlying's own `CHART_EQUITY` stream, which is
   * started/swapped automatically alongside `subscribe-underlying` and
   * isn't affected by this call.
   */
  async subscribeOptionChart(
    requestedSymbol: string | null,
  ): Promise<SwitchUnderlyingResult> {
    const symbol = requestedSymbol?.toUpperCase()?.trim() || null;

    if (symbol === this.optionChartSymbol) {
      return { status: 'ok', symbol: symbol ?? '' };
    }

    if (!this.loggedIn) {
      return {
        status: 'error',
        symbol: symbol ?? '',
        message: 'Streamer not connected to Schwab yet',
      };
    }

    if (this.optionChartSymbol) {
      this.sendRequest({
        service: 'CHART_OPTIONS',
        command: 'UNSUBS',
        requestid: this.nextRequestId(),
        parameters: { keys: this.optionChartSymbol },
      });
    }

    if (symbol) {
      this.sendRequest({
        service: 'CHART_OPTIONS',
        command: 'SUBS',
        requestid: this.nextRequestId(),
        parameters: { keys: symbol, fields: CHART_OPTIONS_FIELD_KEYS },
      });
    }

    this.optionChartSymbol = symbol;
    return { status: 'ok', symbol: symbol ?? '' };
  }

  // TEMP DEBUG (remove after next deploy): frontend reports CHART_EQUITY
  // OHLCV shifted by one field (low > high observed). Log the first raw
  // frame verbatim to confirm true field numbering empirically before
  // changing CHART_EQUITY_FIELDS, same approach used to root-cause the
  // LEVELONE_OPTIONS field mislabel.
  private chartEquityRawLogged = false;

  private handleChartEquityCandles(candles: Array<Record<string, any>>): void {
    if (!this.chartEquityRawLogged && candles.length > 0) {
      this.chartEquityRawLogged = true;
      this.logger.warn(
        `TEMP DEBUG raw CHART_EQUITY frame: ${JSON.stringify(candles[0])}`,
      );
    }
    for (const candle of candles) {
      const chartTime = candle[CHART_EQUITY_FIELDS.CHART_TIME];
      if (typeof chartTime !== 'number') continue;
      this.optionsGateway.emitChartCandle({
        symbol: candle[CHART_EQUITY_FIELDS.KEY] ?? this.underlyingSymbol,
        assetType: 'EQUITY',
        open: candle[CHART_EQUITY_FIELDS.OPEN],
        high: candle[CHART_EQUITY_FIELDS.HIGH],
        low: candle[CHART_EQUITY_FIELDS.LOW],
        close: candle[CHART_EQUITY_FIELDS.CLOSE],
        volume: candle[CHART_EQUITY_FIELDS.VOLUME],
        chartTime,
      });
    }
  }

  private handleChartOptionCandles(candles: Array<Record<string, any>>): void {
    for (const candle of candles) {
      const chartTime = candle[CHART_OPTIONS_FIELDS.CHART_TIME];
      if (typeof chartTime !== 'number') continue;
      this.optionsGateway.emitChartCandle({
        symbol: candle[CHART_OPTIONS_FIELDS.KEY] ?? this.optionChartSymbol,
        assetType: 'OPTION',
        open: candle[CHART_OPTIONS_FIELDS.OPEN],
        high: candle[CHART_OPTIONS_FIELDS.HIGH],
        low: candle[CHART_OPTIONS_FIELDS.LOW],
        close: candle[CHART_OPTIONS_FIELDS.CLOSE],
        volume: candle[CHART_OPTIONS_FIELDS.VOLUME],
        chartTime,
      });
    }
  }

  private handleEquityTicks(ticks: Array<Record<string, any>>): void {
    for (const tick of ticks) {
      const price = tick[LEVEL_ONE_EQUITY_FIELDS.LAST_PRICE];
      if (typeof price === 'number' && price > 0) {
        this.pendingUnderlyingPrice = price;
        this.lastKnownSpotPrice = price;
        this.recenterLadder(price);
      }
    }
  }

  /**
   * Re-centers the 16-strike (8 ITM / 8 OTM) window whenever the spot price
   * drifts `RECENTER_BUFFER_STRIKES` increments away from the current
   * center, OR the calendar day has rolled over since the window was last
   * built (0DTE contracts expire at today's close, so yesterday's symbols
   * are dead and must be replaced with today's even if price hasn't moved)
   * - diffing old vs. new symbol sets to issue minimal UNSUBS/SUBS calls
   * either way. The buffer (rather than rebuilding on *any* strike change)
   * is deliberate hysteresis - see `ladder-recenter.util.ts` for why a
   * tighter threshold thrashes the subscription and blanks out the chain.
   */
  private recenterLadder(spotPrice: number): void {
    const nearestStrike = computeNearestStrike(spotPrice, this.strikeIncrement);
    const expiration = new Date();
    const todayKey = formatDateKey(expiration);
    const dayRolledOver =
      this.currentExpirationDateKey !== null &&
      this.currentExpirationDateKey !== todayKey;

    if (
      !shouldRecenterLadder({
        nearestStrike,
        centerStrike: this.centerStrike,
        strikeIncrement: this.strikeIncrement,
        dayRolledOver,
      })
    ) {
      return;
    }

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

    this.unsubscribeOptions(toUnsub);
    this.addOptionSubscriptions(toSub);

    this.centerStrike = nearestStrike;
    this.currentExpirationDateKey = todayKey;
    this.currentWindowSymbols = newSymbols;
    this.optionsGateway.emitLadderRecentered({
      centerStrike: nearestStrike,
      symbols: [...newSymbols],
    });
  }

  /**
   * Removes symbols from the `LEVELONE_OPTIONS` subscription, chunked to
   * `OPTIONS_SUBSCRIBE_CHUNK_SIZE` per request - see `addOptionSubscriptions`
   * for why chunking matters even though `UNSUBS` doesn't have `SUBS`'s
   * "replaces everything" semantics; kept the same size for consistency and
   * because a long `keys` string is the shared suspect either way.
   */
  private unsubscribeOptions(symbols: string[]): void {
    for (const chunk of chunkArray(symbols, OPTIONS_SUBSCRIBE_CHUNK_SIZE)) {
      this.sendRequest({
        service: 'LEVELONE_OPTIONS',
        command: 'UNSUBS',
        requestid: this.nextRequestId(),
        parameters: { keys: chunk.join(',') },
      });
    }
  }

  /**
   * Adds symbols to the `LEVELONE_OPTIONS` subscription via chunked `ADD`
   * requests - **never** a bare multi-symbol `SUBS`. Frontend reproduced 3/3
   * that building the 32-symbol ladder via one `SUBS` request listing all 32
   * keys left only the trailing 6 (a contiguous slice, every time) actually
   * receiving ticks - every near-the-money strike went permanently silent
   * with zero errors and zero subscription churn to explain it. Schwab's own
   * Streamer Guide documents `SUBS` as replacing the entire subscription set
   * for a service and explicitly says `ADD` is fine to use even for the
   * first subscription, so growing the ladder via small `ADD` batches avoids
   * relying on Schwab correctly registering one request with a long `keys`
   * string, regardless of whether the exact failure mode was `SUBS`
   * semantics or an undocumented request-size limit.
   */
  private addOptionSubscriptions(symbols: string[]): void {
    for (const chunk of chunkArray(symbols, OPTIONS_SUBSCRIBE_CHUNK_SIZE)) {
      this.sendRequest({
        service: 'LEVELONE_OPTIONS',
        command: 'ADD',
        requestid: this.nextRequestId(),
        parameters: {
          keys: chunk.join(','),
          fields: LEVEL_ONE_OPTIONS_FIELD_KEYS,
        },
      });
    }
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
        return;
      }

      // Piggyback the day-rollover check on this same interval: overnight,
      // there can be long gaps with zero equity ticks (options don't trade
      // after hours at all), so don't wait on the next tick to notice the
      // 0DTE expiration date changed - proactively rebuild with the last
      // known price as soon as the calendar day rolls over.
      if (
        this.loggedIn &&
        this.lastKnownSpotPrice !== null &&
        this.currentExpirationDateKey !== null &&
        this.currentExpirationDateKey !== formatDateKey(new Date())
      ) {
        this.logger.log(
          '0DTE expiration date rolled over; forcing option ladder rebuild',
        );
        this.recenterLadder(this.lastKnownSpotPrice);
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

    this.logger.debug(`-> ${request.service}/${request.command}`);
    this.socket.send(JSON.stringify({ requests: [fullRequest] }));
  }

  private nextRequestId(): string {
    return String(this.requestId++);
  }
}
