import { forwardRef, Inject, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { EventEmitter } from 'events';
import { Server, Socket } from 'socket.io';

import jwtConfig from '@iam/config/jwt.config';

import { PositionSnapshot } from '@schwab/shared/account-data.mapper';

import { OptionTick } from './option-tick.mapper';
import {
  SchwabStreamerService,
  SwitchUnderlyingResult,
} from './schwab-streamer.service';

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
  minEquityOk: boolean;
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

/**
 * Outbound relay to the frontend. This is intentionally decoupled from the
 * raw Schwab streamer connection (see SchwabStreamerService) - the frontend
 * never talks to Schwab directly.
 *
 * This socket carries account balances and live positions, so every
 * connection must present a valid JWT from this backend's own auth system
 * (the same one guarding the REST endpoints) via the Socket.io handshake -
 * either `auth: { token }`, a `token` query param, or an Authorization
 * header. Unauthenticated sockets are disconnected immediately.
 *
 * Also extends Node's EventEmitter so in-process consumers (BotEngineService,
 * BotMarketDataService) can subscribe to the same payloads this gateway
 * broadcasts over the socket, without a second Schwab subscription or a
 * circular module dependency.
 */
@WebSocketGateway({
  namespace: '/options',
  cors: { origin: allowedOrigins, credentials: true },
})
export class OptionsGateway
  extends EventEmitter
  implements OnGatewayConnection
{
  private readonly logger = new Logger(OptionsGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
    @Inject(forwardRef(() => SchwabStreamerService))
    private readonly streamerService: SchwabStreamerService,
  ) {
    super();
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

    try {
      await this.jwtService.verifyAsync(token, this.jwtConfiguration);
      this.logger.log(`Client connected: ${client.id}`);
      // Replay current state so a client joining after the ladder/streamer
      // already stabilized isn't stuck waiting for the next change event.
      const snapshot = this.streamerService.getSnapshotForNewClient();
      client.emit('stream-status', snapshot.streamStatus);
      if (snapshot.ladder) {
        client.emit('ladder-recentered', snapshot.ladder);
      }
    } catch {
      this.logger.warn(`Rejecting socket ${client.id}: invalid/expired token`);
      client.disconnect(true);
    }
  }

  private extractToken(client: Socket): string | undefined {
    const authToken = client.handshake.auth?.token as string | undefined;
    if (authToken) return authToken;

    const queryToken = client.handshake.query?.token as string | undefined;
    if (queryToken) return queryToken;

    const header = client.handshake.headers?.authorization;
    if (typeof header === 'string') {
      const [, token] = header.split(' ');
      return token;
    }

    return undefined;
  }

  /**
   * Switches the shared ladder to a new underlying (SPY/QQQ/IWM/SPX/SPXW).
   * This affects every connected client (there's one shared Schwab streamer
   * connection, not one per socket) - last request wins. Returns an ack if
   * the client's `emit` included a callback; fire-and-forget otherwise.
   */
  @SubscribeMessage('subscribe-underlying')
  async handleSubscribeUnderlying(
    @MessageBody() body: { symbol: string },
  ): Promise<SwitchUnderlyingResult> {
    this.logger.log(`Client requested underlying: ${body?.symbol}`);
    return this.streamerService.switchUnderlying(body?.symbol);
  }

  /**
   * Starts/swaps/stops the single tracked-option premium chart stream
   * (frontend contract section 9b) - shared across all connected clients,
   * last request wins, same pattern as `subscribe-underlying`. Send
   * `symbol: null` to unsubscribe without affecting the underlying's
   * `CHART_EQUITY` stream (started automatically alongside
   * `subscribe-underlying`, not via this event).
   */
  @SubscribeMessage('subscribe-option-chart')
  async handleSubscribeOptionChart(
    @MessageBody() body: { symbol: string | null },
  ): Promise<SwitchUnderlyingResult> {
    this.logger.log(`Client requested option chart: ${body?.symbol}`);
    return this.streamerService.subscribeOptionChart(body?.symbol ?? null);
  }

  emitOptionTicks(ticks: OptionTick[]): void {
    this.server?.emit('option-ticks', ticks);
    this.emit('option-ticks', ticks);
  }

  emitUnderlyingPrice(payload: UnderlyingPricePayload): void {
    this.server?.emit('underlying-price', payload);
    this.emit('underlying-price', payload);
  }

  emitLadderRecentered(payload: LadderRecenteredPayload): void {
    this.server?.emit('ladder-recentered', payload);
    this.emit('ladder-recentered', payload);
  }

  emitStreamStatus(payload: StreamStatusPayload): void {
    this.server?.emit('stream-status', payload);
    this.emit('stream-status', payload);
  }

  emitAccountSnapshot(payload: AccountSnapshotPayload): void {
    this.server?.emit('account-snapshot', payload);
    this.emit('account-snapshot', payload);
  }

  emitChartCandle(payload: ChartCandlePayload): void {
    this.server?.emit('chart-candle', payload);
    this.emit('chart-candle', payload);
  }

  /** Frontend contract section 10d — lets the chart flip entry→closed and
   * clear stop lines without polling `GET /orders/working` itself. */
  emitOrderUpdate(payload: OrderUpdatePayload): void {
    this.server?.emit('order-update', payload);
    this.emit('order-update', payload);
  }

  /** Bot control-plane telemetry (BotModule §14) — mirrors `GET /bot/status`. */
  emitBotStatus(payload: BotStatusPayload): void {
    this.server?.emit('bot-status', payload);
    this.emit('bot-status', payload);
  }

  /** Bot live-watch activity feed (§14j) — each new event as it happens. */
  emitBotEvent(payload: BotEventPayload): void {
    this.server?.emit('bot-event', payload);
    this.emit('bot-event', payload);
  }
}
