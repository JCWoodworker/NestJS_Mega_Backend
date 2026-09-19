import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * One row per app user who has connected their own Schwab account.
 * accessToken/refreshToken are stored AES-256-GCM encrypted (see
 * token-encryption.util.ts), never in plaintext.
 *
 * The unique index on `user_id` is what keeps re-running the connect flow an
 * upsert rather than an insert. Duplicate rows for one user previously let a
 * refresh redeem an already-spent refresh_token, which Schwab answers by
 * revoking the whole token family.
 */
@Entity('schwab_tokens')
export class SchwabToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('UQ_schwab_tokens_user_id', { unique: true })
  @Column({ type: 'varchar', name: 'user_id' })
  userId: string;

  @Column({ type: 'text', name: 'access_token' })
  accessToken: string;

  @Column({ type: 'text', name: 'refresh_token' })
  refreshToken: string;

  @Column({ type: 'timestamptz', name: 'access_token_expires_at' })
  accessTokenExpiresAt: Date;

  @Column({ type: 'timestamptz', name: 'refresh_token_expires_at' })
  refreshTokenExpiresAt: Date;

  /**
   * Cached from `SchwabAccountResolver.resolve()`, not authoritative — the
   * live Schwab `/accounts` call is still the source of truth and can
   * change it. Persisted so reporting (admin per-user P&L) is a plain
   * column read instead of a live call per user, and so it survives past a
   * refresh-token expiry that would otherwise make a live resolve
   * impossible for a disconnected account.
   */
  @Column({ type: 'varchar', length: 64, name: 'account_hash', nullable: true })
  accountHash: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
