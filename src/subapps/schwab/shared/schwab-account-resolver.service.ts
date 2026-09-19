import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SchwabToken } from '@schwab/auth/entities/schwab-token.entity';
import { OrdersService } from '@schwab/orders/orders.service';

import { currentUserId, requireUserId } from './schwab-user-context';

/**
 * Resolves "which Schwab account is this user operating" in one place.
 *
 * This logic previously existed as five near-identical private copies (auth,
 * pnl, transaction sync, account snapshot, order updates, bot state), each
 * with its own `cachedAccountHash` field and each consulting
 * `SCHWAB_ACCOUNT_HASH`. That env var is a single deployment-wide value, so
 * under multi-tenant every copy was a path to resolving one user's request
 * against the owner's brokerage account. Fixing it once is the only version
 * that stays fixed.
 *
 * `listAccounts()` runs under the caller's AsyncLocalStorage context, so the
 * result is inherently scoped to the token that user connected.
 */
@Injectable()
export class SchwabAccountResolver {
  private readonly logger = new Logger(SchwabAccountResolver.name);
  private readonly cache = new Map<string, string>();

  constructor(
    @Inject(forwardRef(() => OrdersService))
    private readonly ordersService: OrdersService,
    @InjectRepository(SchwabToken)
    private readonly tokenRepository: Repository<SchwabToken>,
  ) {}

  /** Throws when the user has linked no accounts. */
  async resolve(): Promise<string> {
    const userId = requireUserId();

    const cached = this.cache.get(userId);
    if (cached) return cached;

    const accounts = await this.ordersService.listAccounts();
    if (!accounts.length) {
      throw new Error('No Schwab accounts linked to this app yet');
    }

    const hash = accounts[0].hashValue;
    this.cache.set(userId, hash);

    // Persisted alongside the in-memory cache so cross-user reporting (admin
    // per-user P&L) reads a column instead of needing this same live call
    // for every user on every page load. Best-effort: a write failure here
    // must not turn a successful resolve into a thrown error.
    this.tokenRepository
      .update({ userId }, { accountHash: hash })
      .catch((err) =>
        this.logger.warn(
          `failed to persist account_hash for user ${userId}: ${
            (err as Error).message
          }`,
        ),
      );

    return hash;
  }

  /** Best-effort variant for status endpoints and pollers, where a missing
   * account is metadata rather than a failure. */
  async resolveOrNull(): Promise<string | null> {
    try {
      return await this.resolve();
    } catch {
      return null;
    }
  }

  /**
   * Drops the cached hash so the next call re-resolves. Callers invoke this
   * when a Schwab call fails in a way that suggests the account set changed
   * — for instance after reconnecting to a different account.
   */
  invalidate(userId = currentUserId()): void {
    if (!userId) return;
    this.cache.delete(userId);
  }
}
