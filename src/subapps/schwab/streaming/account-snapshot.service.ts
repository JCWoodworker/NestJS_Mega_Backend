import { HttpService } from '@nestjs/axios';
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

import schwabConfig from '@schwab/config/schwab.config';
import { OrdersService } from '@schwab/orders/orders.service';
import {
  mapAccountBalances,
  mapAccountPositions,
} from '@schwab/shared/account-data.mapper';

import { AccountSnapshotPayload, OptionsGateway } from './options.gateway';

/**
 * Polls Schwab's account REST endpoint on an interval and re-broadcasts
 * balances over the /options socket as `account-snapshot`, per the doc's
 * client-side pre-flight affordability engine (equity/settledCash/
 * optionsBuyingPower). Delivered over the socket rather than a REST
 * endpoint the frontend polls itself, per the agreed frontend contract.
 *
 * The account hash isn't known until after the Schwab OAuth connect flow
 * completes (there's no per-request caller to supply one, unlike the REST
 * order endpoints), so it's resolved once via `/accounts/accountNumbers`
 * and cached rather than relying on a hardcoded `SCHWAB_ACCOUNT_HASH` env
 * var, which is optional and typically unset.
 */
@Injectable()
export class AccountSnapshotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccountSnapshotService.name);
  private pollTimer: NodeJS.Timeout | null = null;
  private cachedAccountHash: string | null = null;

  constructor(
    private readonly httpService: HttpService,
    private readonly optionsGateway: OptionsGateway,
    private readonly ordersService: OrdersService,
    @Inject(schwabConfig.KEY)
    private readonly config: ConfigType<typeof schwabConfig>,
  ) {}

  onModuleInit(): void {
    this.pollTimer = setInterval(
      () => void this.pollAndBroadcast(),
      this.config.accountSnapshotPollMs,
    );
  }

  onModuleDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  private async resolveAccountHash(): Promise<string> {
    if (this.config.accountHash) return this.config.accountHash;
    if (this.cachedAccountHash) return this.cachedAccountHash;

    const accounts = await this.ordersService.listAccounts();
    if (!accounts.length) {
      throw new Error('No Schwab accounts linked to this app yet');
    }
    this.cachedAccountHash = accounts[0].hashValue;
    return this.cachedAccountHash;
  }

  async fetchSnapshot(): Promise<Omit<AccountSnapshotPayload, 'asOf'>> {
    const accountHash = await this.resolveAccountHash();
    const response = await firstValueFrom(
      this.httpService.get(`/trader/v1/accounts/${accountHash}`, {
        params: { fields: 'positions' },
      }),
    );

    const balances = mapAccountBalances(response.data);

    // TEMPORARY: confirms whether the $4.99 figures the frontend keeps
    // seeing are actually what Schwab is returning live right now vs.
    // something cached/stale on our end. Only logs the same 3 fields
    // already broadcast unencrypted to every connected client on every poll
    // (see emitAccountSnapshot) - no new data exposure. Remove once the
    // "stale balance" bug report is resolved.
    this.logger.warn(
      `[TEMP DEBUG] account-snapshot balances for ${accountHash.slice(
        0,
        8,
      )}...: ${JSON.stringify(balances)}`,
    );

    return {
      ...balances,
      positions: mapAccountPositions(response.data),
    };
  }

  private async pollAndBroadcast(): Promise<void> {
    try {
      const snapshot = await this.fetchSnapshot();
      this.optionsGateway.emitAccountSnapshot({
        ...snapshot,
        asOf: Date.now(),
      });
    } catch (err) {
      const message = err?.response?.data?.message || err.message;
      if (message?.includes('not connected')) {
        this.logger.debug(
          'Skipping account snapshot poll: Schwab account not connected yet',
        );
      } else {
        // Account hash may have changed (e.g. re-connected to a different
        // account) — clear the cache so the next poll re-resolves it.
        this.cachedAccountHash = null;
        this.logger.warn(`Account snapshot poll failed: ${message}`);
      }
    }
  }
}
