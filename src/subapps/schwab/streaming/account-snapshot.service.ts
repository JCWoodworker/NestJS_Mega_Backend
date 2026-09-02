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

import { AccountSnapshotPayload, OptionsGateway } from './options.gateway';

/**
 * Polls Schwab's account REST endpoint on an interval and re-broadcasts
 * balances over the /options socket as `account-snapshot`, per the doc's
 * client-side pre-flight affordability engine (equity/settledCash/
 * optionsBuyingPower). Delivered over the socket rather than a REST
 * endpoint the frontend polls itself, per the agreed frontend contract.
 */
@Injectable()
export class AccountSnapshotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccountSnapshotService.name);
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly httpService: HttpService,
    private readonly optionsGateway: OptionsGateway,
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

  async fetchSnapshot(): Promise<Omit<AccountSnapshotPayload, 'asOf'>> {
    const response = await firstValueFrom(
      this.httpService.get(`/trader/v1/accounts/${this.config.accountHash}`),
    );

    // Field names vary between cash and margin accounts on Schwab's API;
    // fall back across the documented aliases rather than assuming one shape.
    const balances = response.data?.securitiesAccount?.currentBalances ?? {};

    return {
      equity: balances.equity ?? balances.liquidationValue ?? 0,
      settledCash:
        balances.cashAvailableForTrading ?? balances.cashBalance ?? 0,
      optionsBuyingPower:
        balances.optionBuyingPower ?? balances.buyingPower ?? 0,
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
        this.logger.warn(`Account snapshot poll failed: ${message}`);
      }
    }
  }
}
