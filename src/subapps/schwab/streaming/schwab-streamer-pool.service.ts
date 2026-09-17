import { HttpService } from '@nestjs/axios';
import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';

import { SchwabAuthService } from '@schwab/auth/schwab-auth.service';
import schwabConfig from '@schwab/config/schwab.config';

import { OptionsGateway } from './options.gateway';
import { SchwabStreamerSession } from './schwab-streamer-session';

/**
 * Owns the lifecycle of one Schwab streamer session per connected user.
 *
 * Sessions are created lazily when a user's first socket connects and torn
 * down when their last one goes away, rather than eagerly at boot. Each
 * session is a real WebSocket to Schwab plus timers, so an always-on session
 * for every registered user would spend dyno memory and Schwab connections
 * on people who are not looking at the screen.
 *
 * The capacity ceiling is deliberate and low by default. N concurrent
 * WebSockets on one Heroku dyno is the hard scaling limit of this design, so
 * exceeding it should surface as an explicit refusal the frontend can render,
 * not as a dyno running out of memory mid-session with open positions.
 */
@Injectable()
export class SchwabStreamerPool implements OnModuleDestroy {
  private readonly logger = new Logger(SchwabStreamerPool.name);
  private readonly sessions = new Map<string, SchwabStreamerSession>();

  constructor(
    private readonly httpService: HttpService,
    private readonly authService: SchwabAuthService,
    @Inject(forwardRef(() => OptionsGateway))
    private readonly optionsGateway: OptionsGateway,
    @Inject(schwabConfig.KEY)
    private readonly config: ConfigType<typeof schwabConfig>,
  ) {}

  onModuleDestroy(): void {
    for (const [userId, session] of this.sessions) {
      session.stop();
      this.logger.log(`Stopped streamer session for user ${userId}`);
    }
    this.sessions.clear();
  }

  /**
   * Returns this user's session, starting one if needed.
   * Throws when the pool is full.
   */
  acquire(userId: string): SchwabStreamerSession {
    const existing = this.sessions.get(userId);
    if (existing) return existing;

    if (this.sessions.size >= this.config.maxStreamerSessions) {
      this.logger.warn(
        `Refusing streamer session for user ${userId}: pool at capacity (${this.config.maxStreamerSessions})`,
      );
      throw new Error(
        'Live market data is at capacity right now — try again shortly',
      );
    }

    const session = new SchwabStreamerSession(
      userId,
      this.httpService,
      this.authService,
      this.optionsGateway,
      this.config,
    );
    this.sessions.set(userId, session);
    session.start();
    this.logger.log(
      `Started streamer session for user ${userId} (${this.sessions.size}/${this.config.maxStreamerSessions})`,
    );
    return session;
  }

  /** Read-only lookup that never starts a session — for callers that only
   * want state if it happens to exist (the bot's staleness checks, the
   * gateway's subscribe handlers). */
  peek(userId: string): SchwabStreamerSession | null {
    return this.sessions.get(userId) ?? null;
  }

  release(userId: string): void {
    const session = this.sessions.get(userId);
    if (!session) return;
    session.stop();
    this.sessions.delete(userId);
    this.logger.log(
      `Stopped streamer session for user ${userId} (${this.sessions.size}/${this.config.maxStreamerSessions} remaining)`,
    );
  }

  /**
   * Keeps a session alive for a user with no open socket.
   *
   * The bot runs unattended — the whole point of the paper supervisor is that
   * nobody is watching — so its market data must not depend on a browser tab
   * being open. Callers that need this are responsible for releasing it.
   */
  acquireForBackgroundWork(userId: string): SchwabStreamerSession {
    return this.acquire(userId);
  }

  activeUserIds(): string[] {
    return [...this.sessions.keys()];
  }
}
