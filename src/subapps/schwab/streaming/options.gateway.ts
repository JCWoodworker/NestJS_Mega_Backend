import { forwardRef, Inject, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { EventEmitter } from 'events';
import { Server, Socket } from 'socket.io';

import { isNonAccessTokenPayload } from '@iam/authentication/access-token-payload.util';
import jwtConfig from '@iam/config/jwt.config';
import type { ActiveUserData } from '@iam/interfaces/active-user-data.interface';

import { PositionSnapshot } from '@schwab/shared/account-data.mapper';

import { OptionTick } from './option-tick.mapper';
import { SchwabStreamerPool } from './schwab-streamer-pool.service';
import { SwitchUnderlyingResult } from './schwab-streamer-session';

export interface UnderlyingPricePayload {
  symbol: string;
  price: number;
  timestamp: number;
}

export interface LadderRecenteredPayload {
  centerStrike: number;
  symbols: string[];
}

export interface StreamStatusPayload {
  connected: boolean;
  lastFrameAt: number | null;
}

export interface AccountSnapshotPayload {
  equity: number;
  settledCash: number;
  optionsBuyingPower: number;
  /** Start-of-day account value - see `AccountBalances.dayStartEquity`. */
  dayStartEquity: number;
  positions: PositionSnapshot[];
  asOf: number;
}

export interface OrderUpdatePayload {
  accountHash: string;
  orderId: string;
  symbol: string;
  status: string;
  orderType?: string | null;
  stopPrice?: number | null;
  price?: number | null;
  filledQuantity?: number;
  averageFillPrice?: number | null;
  /** Schwab's human-readable reason, populated on REJECTED/CANCELED. */
  statusDescription?: string | null;
  asOf: number;
}

export interface ChartCandlePayload {
  symbol: string;
  assetType: 'EQUITY' | 'OPTION';
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  chartTime: number;
}

export interface BotStatusPayload {
  mode: string;
  lane: string | null;
  running: boolean;
  phase: string;
  lockout: boolean;
  lockoutReason: string | null;
  equity: number;
  settledCash: number;
  paperEquity: number;
  paperSettledCash: number;
  minEquityOk: boolean;
  minEquityThreshold: number;
  openPosition: unknown;
  lastSignal: unknown;
  lastError: string | null;
  todayBotPnl: number;
  tradesToday: number;
  liveArmed?: boolean;
  recentEvents?: BotEventPayload[];
}

/** Live watch activity feed row (frontend contract §14j). `lane` is nullable
 * here even though the frontend type documents it as required — a kill/
 * lockout event that fires before any lane was ever selected has no lane to
 * report; treat a missing `lane` on the wire as "not lane-specific". */
export interface BotEventPayload {
  id: string;
  at: number;
  lane: string | null;
  type: string;
  direction?: string;
  side?: string;
  symbol?: string;
  quantity?: number;
  fillPrice?: number;
  underlyingPrice?: number;
  strategies?: string[];
  reason?: string;
  orderId?: string;
  payload?: Record<string, unknown>;
}

const allowedOrigins =
  process.env.ENVIRONMENT === 'development'
    ? process.env.ALLOWED_ORIGINS_DEVELOPMENT?.split(',').map((o) =>
        o.trim(),
      ) ?? '*'
    : process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()) ?? [];

/** Socket.io room carrying one user's Schwab data. */
export function schwabUserRoom(userId: string): string {
  return `schwab-user:${userId}`;
}

/**
 * Outbound relay to the frontend. This is intentionally decoupled from the
 * raw Schwab streamer connection (see SchwabStreamerSession) - the frontend
 * never talks to Schwab directly.
 *
 * This socket carries account balances and live positions, so every
 * connection must present a valid JWT from this backend's own auth system
 * (the same one guarding the REST endpoints) via the Socket.io handshake -
 * either `auth: { token }` or an Authorization header. Unauthenticated
 * sockets are disconnected immediately.
 *
 * Every payload is addressed to one user's room rather than broadcast. The
 * JWT used to be verified and then discarded, so account snapshots, order
 * updates and bot events went to every connected client — harmless with a
 * single desk, a data leak the moment a second user signs in.
 *
 * Also extends Node's EventEmitter so in-process consumers (BotEngineService,
 * BotMarketDataService) can subscribe to the same payloads this gateway
 * relays, without a second Schwab subscription or a circular module
 * dependency. Those internal events carry the userId as their first
 * argument for the same routing reason.
 */
@WebSocketGateway({
  namespace: '/options',
  cors: { origin: allowedOrigins, credentials: true },
})
export class OptionsGateway
  extends EventEmitter
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(OptionsGateway.name);

  /** socket.id -> userId, so disconnect can find the owner without re-parsing
   * a token that may have expired in the meantime. */
  private readonly socketUsers = new Map<string, string>();
  /** userId -> live socket ids. A user's streamer session is torn down when
   * this empties, so a browser refresh (disconnect then reconnect) does not
   * thrash the Schwab connection as long as the sets overlap. */
  private readonly userSockets = new Map<string, Set<string>>();

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
    @Inject(forwardRef(() => SchwabStreamerPool))
    private readonly streamerPool: SchwabStreamerPool,
  ) {
    super();
    // One pair of internal listeners per bot consumer, not per user, so this
    // does not need to scale with tenant count.
    this.setMaxListeners(20);
  }

  async handleConnection(client: Socket): Promise<void> {
    const token = this.extractToken(client);
    if (!token) {
      this.logger.warn(
        `Rejecting socket ${client.id}: no auth token presented`,
      );
      client.disconnect(true);
      return;
    }

    let userId: string;
    try {
      const payload = await this.jwtService.verifyAsync<ActiveUserData>(
        token,
        this.jwtConfiguration,
      );
      if (!payload?.sub) {
        throw new Error('token carries no subject');
      }
      // A refresh or email-verification token verifies against the same
      // secret; neither should open an account-data stream.
      if (isNonAccessTokenPayload(payload)) {
        throw new Error('token is not an access token');
      }
      userId = payload.sub;
    } catch {
      this.logger.warn(`Rejecting socket ${client.id}: invalid/expired token`);
      client.disconnect(true);
      return;
    }

    await client.join(schwabUserRoom(userId));
    this.socketUsers.set(client.id, userId);
    const sockets = this.userSockets.get(userId) ?? new Set<string>();
    sockets.add(client.id);
    this.userSockets.set(userId, sockets);
    this.logger.log(`Client connected: ${client.id} (user ${userId})`);

    let session: ReturnType<SchwabStreamerPool['acquire']>;
    try {
      session = this.streamerPool.acquire(userId);
    } catch (err) {
      // Pool at capacity. Tell the client explicitly rather than leaving it
      // waiting for ticks that will never arrive.
      client.emit('stream-status', {
        connected: false,
        lastFrameAt: null,
        reason: (err as Error).message,
      });
      return;
    }

    // Replay current state so a client joining after the ladder/streamer
    // already stabilized isn't stuck waiting for the next change event.
    const snapshot = session.getSnapshotForNewClient();
    client.emit('stream-status', snapshot.streamStatus);
    if (snapshot.ladder) {
      client.emit('ladder-recentered', snapshot.ladder);
    }
  }

  handleDisconnect(client: Socket): void {
    const userId = this.socketUsers.get(client.id);
    this.socketUsers.delete(client.id);
    if (!userId) return;

    const sockets = this.userSockets.get(userId);
    sockets?.delete(client.id);
    if (sockets?.size) return;

    // Last tab closed. Drops this gateway's ('socket') hold on the streamer
    // — the pool only actually stops it once no other holder (the bot,
    // while armed) needs it either.
    this.userSockets.delete(userId);
    this.streamerPool.release(userId);
    this.logger.log(`Last client for user ${userId} disconnected`);
  }

  private extractToken(client: Socket): string | undefined {
    const authToken = client.handshake.auth?.token as string | undefined;
    if (authToken) return authToken;

    // Query-string tokens are rejected — they leak via proxies/access logs.
    // FE uses `auth: { token }` only (`src/lib/socket.ts`).

    const header = client.handshake.headers?.authorization;
    if (typeof header === 'string') {
      const [, token] = header.split(' ');
      return token;
    }

    return undefined;
  }

  /**
   * Switches this user's ladder to a new US equity/ETF/index underlying.
   *
   * No longer affects other clients: each user drives their own streamer
   * session, so this is per-connection rather than the previous
   * last-request-wins-for-everybody behaviour.
   */
  @SubscribeMessage('subscribe-underlying')
  async handleSubscribeUnderlying(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { symbol: string },
  ): Promise<SwitchUnderlyingResult> {
    const session = this.sessionFor(client);
    if (!session) {
      return {
        status: 'error',
        symbol: body?.symbol ?? '',
        message: 'No active Schwab streamer session for this connection',
      };
    }
    this.logger.log(`Client requested underlying: ${body?.symbol}`);
    return session.switchUnderlying(body?.symbol);
  }

  /**
   * Starts/swaps/stops this user's tracked-option premium chart stream
   * (frontend contract section 9b). Send `symbol: null` to unsubscribe
   * without affecting the underlying's `CHART_EQUITY` stream (started
   * automatically alongside `subscribe-underlying`, not via this event).
   */
  @SubscribeMessage('subscribe-option-chart')
  async handleSubscribeOptionChart(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { symbol: string | null },
  ): Promise<SwitchUnderlyingResult> {
    const session = this.sessionFor(client);
    if (!session) {
      return {
        status: 'error',
        symbol: body?.symbol ?? '',
        message: 'No active Schwab streamer session for this connection',
      };
    }
    this.logger.log(`Client requested option chart: ${body?.symbol}`);
    return session.subscribeOptionChart(body?.symbol ?? null);
  }

  private sessionFor(client: Socket) {
    const userId = this.socketUsers.get(client.id);
    return userId ? this.streamerPool.peek(userId) : null;
  }

  /**
   * Single chokepoint for outbound delivery.
   *
   * Room-scoped rather than `server.emit`, and the internal EventEmitter
   * carries the userId so in-process consumers can route too. Going through
   * one method means a new event type cannot accidentally reintroduce a
   * broadcast.
   */
  private dispatch(userId: string, event: string, payload: unknown): void {
    this.server?.to(schwabUserRoom(userId)).emit(event, payload);
    this.emit(event, userId, payload);
  }

  emitOptionTicks(userId: string, ticks: OptionTick[]): void {
    this.dispatch(userId, 'option-ticks', ticks);
  }

  emitUnderlyingPrice(userId: string, payload: UnderlyingPricePayload): void {
    this.dispatch(userId, 'underlying-price', payload);
  }

  emitLadderRecentered(userId: string, payload: LadderRecenteredPayload): void {
    this.dispatch(userId, 'ladder-recentered', payload);
  }

  emitStreamStatus(userId: string, payload: StreamStatusPayload): void {
    this.dispatch(userId, 'stream-status', payload);
  }

  emitAccountSnapshot(userId: string, payload: AccountSnapshotPayload): void {
    this.dispatch(userId, 'account-snapshot', payload);
  }

  emitChartCandle(userId: string, payload: ChartCandlePayload): void {
    this.dispatch(userId, 'chart-candle', payload);
  }

  /** Frontend contract section 10d — lets the chart flip entry→closed and
   * clear stop lines without polling `GET /orders/working` itself. */
  emitOrderUpdate(userId: string, payload: OrderUpdatePayload): void {
    this.dispatch(userId, 'order-update', payload);
  }

  /** Bot control-plane telemetry (BotModule §14) — mirrors `GET /bot/status`. */
  emitBotStatus(userId: string, payload: BotStatusPayload): void {
    this.dispatch(userId, 'bot-status', payload);
  }

  /** Bot live-watch activity feed (§14j) — each new event as it happens. */
  emitBotEvent(userId: string, payload: BotEventPayload): void {
    this.dispatch(userId, 'bot-event', payload);
  }
}
