import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ArrayContains,
  Between,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';

import { Users } from '@users/entities/users.entity';

import { RefreshTokens } from '@iam/authentication/refresh-token-storage/refresh-token-storage.entity';
import jwtConfig from '@iam/config/jwt.config';
import { EmailService } from '@iam/email/email.service';

import { SchwabToken } from '@schwab/auth/entities/schwab-token.entity';
import { BotCapitalEvent } from '@schwab/bot/entities/bot-capital-event.entity';
import { BotDailyReport } from '@schwab/bot/entities/bot-daily-report.entity';
import { BotEvent } from '@schwab/bot/entities/bot-event.entity';
import { BotSettings } from '@schwab/bot/entities/bot-settings.entity';
import { BotState } from '@schwab/bot/entities/bot-state.entity';
import { BotTrade } from '@schwab/bot/entities/bot-trade.entity';
import { BotTradeTape } from '@schwab/bot/entities/bot-trade-tape.entity';
import { BotMode } from '@schwab/bot/enums/bot-mode.enum';
import { SchwabDailyPnl } from '@schwab/pnl/entities/schwab-daily-pnl.entity';
import { SchwabOrderHistory } from '@schwab/pnl/entities/schwab-order-history.entity';
import { SchwabOrderSourceTag } from '@schwab/pnl/entities/schwab-order-source-tag.entity';
import { SchwabRealizedTrade } from '@schwab/pnl/entities/schwab-realized-trade.entity';
import { SchwabTradeFill } from '@schwab/pnl/entities/schwab-trade-fill.entity';
import { SchwabTransaction } from '@schwab/pnl/entities/schwab-transaction.entity';
import {
  aggregateRealizedTrades,
  type PnlInsight,
} from '@schwab/pnl/pnl-insight.util';

import {
  csvAttachment,
  entityToPlain,
  type CsvAttachment,
} from './admin-user-csv.util';

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

export interface AdminPurgePreview {
  userId: string;
  email: string;
  signupSources: string[];
  accountHash: string | null;
  canPurge: boolean;
  blockReason: string | null;
  foreignProductHits: {
    cbcProduct: number;
    cbcUserAndProduct: number;
    cbcLinks: number;
    oblUsersAndBusinesses: number;
  };
  counts: Record<string, number>;
}

/**
 * Backs the admin Users table and support actions (export, lock, sign-out,
 * disconnect Schwab, resend verification, hard purge).
 *
 * Deliberately does not call `PnlService` or go through
 * `SchwabAccountResolver.resolve()` for overview — those exist to answer
 * "what is MY account". `@Roles(Role.Admin)` is the authorization boundary.
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
    @InjectRepository(BotSettings)
    private readonly botSettingsRepository: Repository<BotSettings>,
    @InjectRepository(BotTrade)
    private readonly botTradeRepository: Repository<BotTrade>,
    @InjectRepository(BotTradeTape)
    private readonly botTradeTapeRepository: Repository<BotTradeTape>,
    @InjectRepository(BotEvent)
    private readonly botEventRepository: Repository<BotEvent>,
    @InjectRepository(BotCapitalEvent)
    private readonly botCapitalEventRepository: Repository<BotCapitalEvent>,
    @InjectRepository(BotDailyReport)
    private readonly botDailyReportRepository: Repository<BotDailyReport>,
    @InjectRepository(SchwabRealizedTrade)
    private readonly realizedRepository: Repository<SchwabRealizedTrade>,
    @InjectRepository(SchwabTransaction)
    private readonly transactionRepository: Repository<SchwabTransaction>,
    @InjectRepository(SchwabTradeFill)
    private readonly tradeFillRepository: Repository<SchwabTradeFill>,
    @InjectRepository(SchwabDailyPnl)
    private readonly dailyPnlRepository: Repository<SchwabDailyPnl>,
    @InjectRepository(SchwabOrderHistory)
    private readonly orderHistoryRepository: Repository<SchwabOrderHistory>,
    @InjectRepository(SchwabOrderSourceTag)
    private readonly orderSourceTagRepository: Repository<SchwabOrderSourceTag>,
    @InjectRepository(RefreshTokens)
    private readonly refreshTokensRepository: Repository<RefreshTokens>,
    private readonly emailService: EmailService,
    private readonly jwtService: JwtService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
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

  async setLocked(
    userId: string,
    locked: boolean,
  ): Promise<{ id: string; email: string; isLocked: boolean }> {
    const user = await this.requireUser(userId);
    await this.usersRepository.update(user.id, { isLocked: locked });
    return { id: user.id, email: user.email, isLocked: locked };
  }

  async forceSignOut(userId: string): Promise<{ deletedRefreshTokens: number }> {
    await this.requireUser(userId);
    const result = await this.refreshTokensRepository.delete({ userId });
    return { deletedRefreshTokens: result.affected ?? 0 };
  }

  async disconnectSchwab(
    userId: string,
  ): Promise<{ deleted: boolean; accountHash: string | null }> {
    await this.requireUser(userId);
    const token = await this.tokenRepository.findOneBy({ userId });
    if (!token) {
      return { deleted: false, accountHash: null };
    }
    const accountHash = token.accountHash;
    await this.tokenRepository.delete({ userId });
    return { deleted: true, accountHash };
  }

  async resendVerification(
    userId: string,
  ): Promise<{ message: string }> {
    const user = await this.requireUser(userId);
    if (user.isEmailVerified) {
      return { message: 'Email already verified' };
    }
    const token = await this.jwtService.signAsync(
      { sub: user.id, purpose: 'email-verify' },
      {
        secret: this.jwtConfiguration.secret,
        audience: this.jwtConfiguration.audience,
        issuer: this.jwtConfiguration.issuer,
        expiresIn: 60 * 60 * 24,
      },
    );
    await this.emailService.sendVerificationEmail(user.email, token);
    return { message: 'Verification email sent' };
  }

  async exportAndEmail(
    userId: string,
  ): Promise<{ emailedTo: string; attachmentCount: number }> {
    const user = await this.requireUser(userId);
    const attachments = await this.buildExportAttachments(user);
    try {
      await this.emailService.sendAccountExportEmail(user.email, attachments);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ServiceUnavailableException(message);
    }
    return { emailedTo: user.email, attachmentCount: attachments.length };
  }

  async purgePreview(userId: string): Promise<AdminPurgePreview> {
    const user = await this.requireUser(userId);
    const token = await this.tokenRepository.findOneBy({ userId });
    const accountHash = token?.accountHash ?? null;
    const foreign = await this.foreignProductHits(userId);
    const nonStrikedesk = (user.signupSources ?? []).filter(
      (s) => s !== 'strikedesk',
    );
    const foreignTotal = Object.values(foreign).reduce((a, b) => a + b, 0);
    let blockReason: string | null = null;
    if (nonStrikedesk.length > 0) {
      blockReason = `signup_sources includes non-strikedesk: ${nonStrikedesk.join(', ')}`;
    } else if (foreignTotal > 0) {
      blockReason = 'user has rows in other subapp tables';
    }

    const counts = await this.collectCounts(userId, accountHash);
    return {
      userId: user.id,
      email: user.email,
      signupSources: user.signupSources ?? [],
      accountHash,
      canPurge: blockReason == null,
      blockReason,
      foreignProductHits: foreign,
      counts,
    };
  }

  async purgeUser(
    userId: string,
    params: { confirmEmail: string; emailExport?: boolean },
  ): Promise<{
    deleted: true;
    email: string;
    exportEmailed: boolean;
    deletedCounts: Record<string, number>;
  }> {
    const preview = await this.purgePreview(userId);
    if (!preview.canPurge) {
      throw new BadRequestException(preview.blockReason ?? 'Cannot purge user');
    }
    if (
      preview.email.trim().toLowerCase() !==
      params.confirmEmail.trim().toLowerCase()
    ) {
      throw new BadRequestException('confirmEmail does not match user email');
    }

    const user = await this.requireUser(userId);
    let exportEmailed = false;
    if (params.emailExport) {
      const attachments = await this.buildExportAttachments(user);
      try {
        await this.emailService.sendAccountExportEmail(user.email, attachments);
        exportEmailed = true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new ServiceUnavailableException(
          `Export email failed — purge aborted: ${message}`,
        );
      }
    }

    const accountHash = preview.accountHash;
    const deletedCounts: Record<string, number> = {};

    await this.usersRepository.manager.transaction(async (manager) => {
      if (accountHash) {
        for (const [key, entity] of [
          ['schwab_transactions', SchwabTransaction],
          ['schwab_trade_fills', SchwabTradeFill],
          ['schwab_realized_trades', SchwabRealizedTrade],
          ['schwab_daily_pnl', SchwabDailyPnl],
          ['schwab_order_history', SchwabOrderHistory],
          ['schwab_order_source_tags', SchwabOrderSourceTag],
        ] as const) {
          const result = await manager.delete(entity, { accountHash });
          deletedCounts[key] = result.affected ?? 0;
        }
      } else {
        for (const key of [
          'schwab_transactions',
          'schwab_trade_fills',
          'schwab_realized_trades',
          'schwab_daily_pnl',
          'schwab_order_history',
          'schwab_order_source_tags',
        ]) {
          deletedCounts[key] = 0;
        }
      }

      const refresh = await manager.delete(RefreshTokens, { userId });
      deletedCounts.refresh_tokens = refresh.affected ?? 0;

      // Cascades bot_* + schwab_tokens via FK ON DELETE CASCADE.
      const userDel = await manager.delete(Users, { id: userId });
      deletedCounts.users = userDel.affected ?? 0;
    });

    return {
      deleted: true,
      email: user.email,
      exportEmailed,
      deletedCounts,
    };
  }

  private async requireUser(userId: string): Promise<Users> {
    const user = await this.usersRepository.findOneBy({ id: userId });
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    return user;
  }

  private async foreignProductHits(userId: string) {
    const q = async (sql: string) => {
      const rows = await this.usersRepository.manager.query(sql, [userId]);
      return Number(rows[0]?.count ?? 0);
    };
    const [cbcProduct, cbcUserAndProduct, cbcLinks, oblUsersAndBusinesses] =
      await Promise.all([
        q(`SELECT COUNT(*)::int AS count FROM "cbc_product" WHERE user_id = $1`),
        q(
          `SELECT COUNT(*)::int AS count FROM "cbc_user_and_product" WHERE user_id = $1`,
        ),
        q(`SELECT COUNT(*)::int AS count FROM "cbc_links" WHERE user_id = $1`),
        q(
          `SELECT COUNT(*)::int AS count FROM "obl_users_and_businesses" WHERE user_id = $1`,
        ),
      ]);
    return { cbcProduct, cbcUserAndProduct, cbcLinks, oblUsersAndBusinesses };
  }

  private async collectCounts(
    userId: string,
    accountHash: string | null,
  ): Promise<Record<string, number>> {
    const byUser = async (repo: Repository<{ userId: string }>) =>
      repo.count({ where: { userId } });

    const byHash = async (repo: Repository<{ accountHash: string }>) =>
      accountHash ? repo.count({ where: { accountHash } }) : 0;

    const [
      schwab_tokens,
      refresh_tokens,
      bot_state,
      bot_settings,
      bot_trades,
      bot_trade_tape,
      bot_events,
      bot_capital_events,
      bot_daily_reports,
      schwab_transactions,
      schwab_trade_fills,
      schwab_realized_trades,
      schwab_daily_pnl,
      schwab_order_history,
      schwab_order_source_tags,
    ] = await Promise.all([
      byUser(this.tokenRepository),
      this.refreshTokensRepository.count({ where: { userId } }),
      byUser(this.botStateRepository),
      byUser(this.botSettingsRepository),
      byUser(this.botTradeRepository),
      byUser(this.botTradeTapeRepository),
      byUser(this.botEventRepository),
      byUser(this.botCapitalEventRepository),
      byUser(this.botDailyReportRepository),
      byHash(this.transactionRepository),
      byHash(this.tradeFillRepository),
      byHash(this.realizedRepository),
      byHash(this.dailyPnlRepository),
      byHash(this.orderHistoryRepository),
      byHash(this.orderSourceTagRepository),
    ]);

    return {
      schwab_tokens,
      refresh_tokens,
      bot_state,
      bot_settings,
      bot_trades,
      bot_trade_tape,
      bot_events,
      bot_capital_events,
      bot_daily_reports,
      schwab_transactions,
      schwab_trade_fills,
      schwab_realized_trades,
      schwab_daily_pnl,
      schwab_order_history,
      schwab_order_source_tags,
    };
  }

  private async buildExportAttachments(user: Users): Promise<CsvAttachment[]> {
    const token = await this.tokenRepository.findOneBy({ userId: user.id });
    const accountHash = token?.accountHash ?? null;

    const profile = [
      {
        id: user.id,
        email: user.email,
        role: user.role,
        isLocked: user.isLocked,
        isEmailVerified: user.isEmailVerified,
        signupSources: (user.signupSources ?? []).join('|'),
        googleId: user.googleId ? 'set' : '',
        first_name: user.first_name,
        last_name: user.last_name,
        created_at: user.created_at,
        updated_at: user.updated_at,
        lastLoginAt: user.lastLoginAt,
        schwabConnected: Boolean(token),
        accountHash,
      },
    ];

    const attachments: CsvAttachment[] = [
      csvAttachment('account_profile.csv', profile),
    ];

    const pushIf = (
      filename: string,
      rows: object[],
    ) => {
      if (rows.length === 0) return;
      attachments.push(
        csvAttachment(filename, rows.map((r) => entityToPlain(r))),
      );
    };

    const [
      settings,
      state,
      trades,
      tape,
      events,
      capital,
      reports,
    ] = await Promise.all([
      this.botSettingsRepository.find({ where: { userId: user.id } }),
      this.botStateRepository.find({ where: { userId: user.id } }),
      this.botTradeRepository.find({ where: { userId: user.id } }),
      this.botTradeTapeRepository.find({ where: { userId: user.id } }),
      this.botEventRepository.find({ where: { userId: user.id } }),
      this.botCapitalEventRepository.find({ where: { userId: user.id } }),
      this.botDailyReportRepository.find({ where: { userId: user.id } }),
    ]);

    pushIf('bot_settings.csv', settings);
    pushIf('bot_state.csv', state);
    pushIf('bot_trades.csv', trades);
    pushIf('bot_trade_tape.csv', tape);
    pushIf('bot_events.csv', events);
    pushIf('bot_capital_events.csv', capital);
    pushIf('bot_daily_reports.csv', reports);

    if (accountHash) {
      const [tx, fills, realized, daily, orders, tags] = await Promise.all([
        this.transactionRepository.find({ where: { accountHash } }),
        this.tradeFillRepository.find({ where: { accountHash } }),
        this.realizedRepository.find({ where: { accountHash } }),
        this.dailyPnlRepository.find({ where: { accountHash } }),
        this.orderHistoryRepository.find({ where: { accountHash } }),
        this.orderSourceTagRepository.find({ where: { accountHash } }),
      ]);
      pushIf('schwab_transactions.csv', tx);
      pushIf('schwab_trade_fills.csv', fills);
      pushIf('schwab_realized_trades.csv', realized);
      pushIf('schwab_daily_pnl.csv', daily);
      pushIf('schwab_order_history.csv', orders);
      pushIf('schwab_order_source_tags.csv', tags);
    }

    return attachments;
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
