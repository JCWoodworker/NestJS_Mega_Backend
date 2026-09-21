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
 * Who is currently relying on a user's streamer session, so it can be kept
 * alive as long as anyone needs it.
 *
 * `'socket'` is a browser tab (`OptionsGateway`); `'bot'` is the engine's own
 * background hold (`BotEngineService`), acquired independently of any tab so
 * an unattended armed bot has live data, and so a browser tab closing mid-
 * position cannot take the bot's feed down with it.
 */
export type StreamerHolder = 'socket' | 'bot';

/**
 * Owns the lifecycle of one Schwab streamer session per connected user.
 *
 * Sessions are created lazily on first hold and torn down once every holder
 * has released, rather than eagerly at boot. Each session is a real
 * WebSocket to Schwab plus timers, so an always-on session for every
 * registered user would spend dyno memory and Schwab connections on people
 * who are neither looking at the screen nor running a bot.
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
  private readonly holders = new Map<string, Set<StreamerHolder>>();

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
    this.holders.clear();
  }

  /**
   * Returns this user's session, starting one if needed, and registers
   * `holder` as a reason to keep it alive.
   *
   * Throws when the pool is full and no session already exists for this
   * user — an existing session is always reused regardless of capacity, so
   * a second holder (e.g. the bot acquiring while a browser tab already has
   * one open) can never be refused.
   */
  acquire(userId: string, holder: StreamerHolder = 'socket'): SchwabStreamerSession {
    const existing = this.sessions.get(userId);
    if (existing) {
      this.holders.get(userId)?.add(holder);
      return existing;
    }

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
    this.holders.set(userId, new Set([holder]));
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

  /**
   * Drops `holder`'s claim on this user's session. The session itself stops
   * only once no holder remains — a browser tab closing must not tear down
   * a feed the bot is still watching, and the bot disarming must not tear
   * down a feed an open tab is still displaying.
   */
  release(userId: string, holder: StreamerHolder = 'socket'): void {
    const holderSet = this.holders.get(userId);
    if (!holderSet) return;
    holderSet.delete(holder);
    if (holderSet.size > 0) return;

    const session = this.sessions.get(userId);
    if (!session) return;
    session.stop();
    this.sessions.delete(userId);
    this.holders.delete(userId);
    this.logger.log(
      `Stopped streamer session for user ${userId} (${this.sessions.size}/${this.config.maxStreamerSessions} remaining)`,
    );
  }

  /**
   * Holds a session open for the bot's own use, tagged with the `'bot'`
   * holder so it survives every browser tab closing.
   *
   * The bot runs unattended — the whole point of the paper supervisor is
   * that nobody is watching — so its market data must not depend on a
   * browser tab being open. Release with `releaseBackgroundWork` once the
   * bot no longer needs it.
   */
  acquireForBackgroundWork(userId: string): SchwabStreamerSession {
    return this.acquire(userId, 'bot');
  }

  releaseBackgroundWork(userId: string): void {
    this.release(userId, 'bot');
  }

  activeUserIds(): string[] {
    return [...this.sessions.keys()];
  }
}
