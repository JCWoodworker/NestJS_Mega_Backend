import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ArrayContains,
  Between,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';

import { Users } from '@users/entities/users.entity';

import { SchwabToken } from '@schwab/auth/entities/schwab-token.entity';
import { BotState } from '@schwab/bot/entities/bot-state.entity';
import { BotMode } from '@schwab/bot/enums/bot-mode.enum';
import { SchwabRealizedTrade } from '@schwab/pnl/entities/schwab-realized-trade.entity';
import {
  aggregateRealizedTrades,
  type PnlInsight,
} from '@schwab/pnl/pnl-insight.util';

export interface AdminUserOverviewRow {
  id: string;
  email: string;
  role: string;
  isLocked: boolean;
  isEmailVerified: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
  signupSources: string[];
  schwabConnected: boolean;
  /** True once `SchwabAccountResolver` has resolved and persisted a hash for
   * this user — until then a connected account has no trade data to show,
   * which is a "not yet" state, not an error. */
  accountHashResolved: boolean;
  usesBot: boolean;
  /** Null when not connected or not yet resolved. */
  insight: PnlInsight | null;
}

/**
 * Backs the admin Users table.
 *
 * Deliberately does not call `PnlService` or go through
 * `SchwabAccountResolver.resolve()` — those exist to answer "what is MY
 * account", enforced via a live ownership check against the caller's own
 * Schwab session. An admin looking at everyone else's data doesn't fit that
 * shape at all: `@Roles(Role.Admin)` is the authorization boundary here, and
 * reading the persisted `account_hash` column directly is what avoids a
 * live Schwab call — and its associated failure mode for anyone whose token
 * has lapsed — for every single user on every page load.
 *
 * Scoped to Strikedesk membership via `signup_sources`, not every row in the
 * shared platform `users` table.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    @InjectRepository(Users)
    private readonly usersRepository: Repository<Users>,
    @InjectRepository(SchwabToken)
    private readonly tokenRepository: Repository<SchwabToken>,
    @InjectRepository(BotState)
    private readonly botStateRepository: Repository<BotState>,
    @InjectRepository(SchwabRealizedTrade)
    private readonly realizedRepository: Repository<SchwabRealizedTrade>,
  ) {}

  async getOverview(query: {
    from?: string;
    to?: string;
  }): Promise<AdminUserOverviewRow[]> {
    const [users, tokens, botStates] = await Promise.all([
      this.usersRepository.find({
        where: { signupSources: ArrayContains(['strikedesk']) },
        order: { created_at: 'DESC' },
      }),
      this.tokenRepository.find(),
      this.botStateRepository.find(),
    ]);

    const tokenByUser = new Map(tokens.map((t) => [t.userId, t]));
    const botStateByUser = new Map(botStates.map((s) => [s.userId, s]));
    const closedAtRange = this.dateRange(query.from, query.to);

    return Promise.all(
      users.map(async (user) => {
        const token = tokenByUser.get(user.id);
        const botState = botStateByUser.get(user.id);
        const insight = await this.insightFor(token, closedAtRange);

        return {
          id: user.id,
          email: user.email,
          role: user.role,
          isLocked: user.isLocked,
          isEmailVerified: user.isEmailVerified,
          createdAt: user.created_at,
          lastLoginAt: user.lastLoginAt,
          signupSources: user.signupSources ?? [],
          schwabConnected: Boolean(token),
          accountHashResolved: Boolean(token?.accountHash),
          usesBot:
            botState?.mode === BotMode.BOT ||
            (insight?.bySource.some(
              (b) =>
                (b.source === 'BOT_LIVE' || b.source === 'BOT_PAPER') &&
                b.trades > 0,
            ) ??
              false),
          insight,
        };
      }),
    );
  }

  private async insightFor(
    token: SchwabToken | undefined,
    closedAtRange: ReturnType<AdminUsersService['dateRange']>,
  ): Promise<PnlInsight | null> {
    if (!token?.accountHash) return null;

    const rows = await this.realizedRepository.find({
      where: {
        accountHash: token.accountHash,
        ...(closedAtRange ? { closedAt: closedAtRange } : {}),
      },
    });

    return aggregateRealizedTrades(
      rows.map((row) => ({
        symbol: row.symbol,
        direction: row.direction,
        quantity: Number(row.quantity),
        openPrice: Number(row.openPrice),
        closePrice: Number(row.closePrice),
        openedAt: row.openedAt.getTime(),
        closedAt: row.closedAt.getTime(),
        realizedPnl: Number(row.realizedPnl),
        source: row.source,
      })),
    );
  }

  private dateRange(from?: string, to?: string) {
    if (from && to) return Between(new Date(from), new Date(to));
    if (from) return MoreThanOrEqual(new Date(from));
    if (to) return LessThanOrEqual(new Date(to));
    return undefined;
  }
}
