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

import schwabConfig from '@schwab/config/schwab.config';
import { DailyPnlService } from '@schwab/pnl/daily-pnl.service';
import {
  mapAccountBalances,
  mapAccountPositions,
} from '@schwab/shared/account-data.mapper';
import { SchwabAccountResolver } from '@schwab/shared/schwab-account-resolver.service';
import { runAsUser } from '@schwab/shared/schwab-user-context';

import { AccountSnapshotPayload, OptionsGateway } from './options.gateway';
import { SchwabStreamerPool } from './schwab-streamer-pool.service';

/**
 * Polls Schwab's account REST endpoint and relays balances to each watching
 * user's socket room as `account-snapshot`, per the doc's client-side
 * pre-flight affordability engine (equity/settledCash/optionsBuyingPower).
 * Delivered over the socket rather than a REST endpoint the frontend polls
 * itself, per the agreed frontend contract.
 *
 * Polls only users with a live streamer session, not every registered user.
 * Schwab's rate limit is per-app rather than per-user, so the tick interval
 * scales with the number of watchers to hold total request rate roughly
 * constant: a fixed 4s poll times N users would blow the whole budget on
 * balance checks somewhere around eight concurrent users, starving order
 * placement.
 */
@Injectable()
export class AccountSnapshotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccountSnapshotService.name);
  private pollTimer: NodeJS.Timeout | null = null;
  private polling = false;

  constructor(
    private readonly httpService: HttpService,
    @Inject(forwardRef(() => OptionsGateway))
    private readonly optionsGateway: OptionsGateway,
    @Inject(forwardRef(() => SchwabStreamerPool))
    private readonly streamerPool: SchwabStreamerPool,
    private readonly accountResolver: SchwabAccountResolver,
    private readonly dailyPnlService: DailyPnlService,
    @Inject(schwabConfig.KEY)
    private readonly config: ConfigType<typeof schwabConfig>,
  ) {}

  onModuleInit(): void {
    this.scheduleNextTick();
  }

  onModuleDestroy(): void {
    if (this.pollTimer) clearTimeout(this.pollTimer);
  }

  /**
   * Self-rescheduling rather than a fixed `setInterval`, so the spacing can
   * widen as watchers arrive. Also prevents overlapping runs, which a fixed
   * interval would allow once a round of polls takes longer than the period.
   */
  private scheduleNextTick(): void {
    const watchers = Math.max(1, this.streamerPool.activeUserIds().length);
    const spacing = Math.max(
      this.config.accountSnapshotPollMs,
      watchers * this.config.accountPollMinSpacingMs,
    );
    this.pollTimer = setTimeout(() => {
      void this.pollAllWatchers().finally(() => this.scheduleNextTick());
    }, spacing);
  }

  async fetchSnapshot(): Promise<Omit<AccountSnapshotPayload, 'asOf'>> {
    const accountHash = await this.accountResolver.resolve();
    const response = await firstValueFrom(
      this.httpService.get(`/trader/v1/accounts/${accountHash}`, {
        params: { fields: 'positions' },
      }),
    );

    return {
      ...mapAccountBalances(response.data),
      positions: mapAccountPositions(response.data),
    };
  }

  private async pollAllWatchers(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      for (const userId of this.streamerPool.activeUserIds()) {
        await runAsUser(userId, () => this.pollAndEmit(userId));
      }
    } finally {
      this.polling = false;
    }
  }

  private async pollAndEmit(userId: string): Promise<void> {
    try {
      const accountHash = await this.accountResolver.resolve();
      const snapshot = await this.fetchSnapshot();
      this.optionsGateway.emitAccountSnapshot(userId, {
        ...snapshot,
        asOf: Date.now(),
      });
      void this.dailyPnlService.recordEquitySample(
        accountHash,
        snapshot.equity,
        snapshot.dayStartEquity,
      );
    } catch (err) {
      const message = err?.response?.data?.message || err.message;
      if (message?.includes('not connected')) {
        this.logger.debug(
          `Skipping account snapshot poll for user ${userId}: Schwab account not connected yet`,
        );
      } else {
        // Account hash may have changed (e.g. re-connected to a different
        // account) — clear the cache so the next poll re-resolves it.
        this.accountResolver.invalidate(userId);
        this.logger.warn(
          `Account snapshot poll failed for user ${userId}: ${message}`,
        );
      }
    }
  }
}
