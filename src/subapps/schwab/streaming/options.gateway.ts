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
import { Server, Socket } from 'socket.io';

import jwtConfig from '@iam/config/jwt.config';

import { PositionSnapshot } from '@schwab/shared/account-data.mapper';

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
  positions: PositionSnapshot[];
  asOf: number;
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
 */
@WebSocketGateway({
  namespace: '/options',
  cors: { origin: allowedOrigins, credentials: true },
})
export class OptionsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(OptionsGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
    @Inject(forwardRef(() => SchwabStreamerService))
    private readonly streamerService: SchwabStreamerService,
  ) {}

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

  emitOptionTicks(ticks: Array<Record<string, unknown>>): void {
    this.server?.emit('option-ticks', ticks);
  }

  emitUnderlyingPrice(payload: UnderlyingPricePayload): void {
    this.server?.emit('underlying-price', payload);
  }

  emitLadderRecentered(payload: LadderRecenteredPayload): void {
    this.server?.emit('ladder-recentered', payload);
  }

  emitStreamStatus(payload: StreamStatusPayload): void {
    this.server?.emit('stream-status', payload);
  }

  emitAccountSnapshot(payload: AccountSnapshotPayload): void {
    this.server?.emit('account-snapshot', payload);
  }
}
