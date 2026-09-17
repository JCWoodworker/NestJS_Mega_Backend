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

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
