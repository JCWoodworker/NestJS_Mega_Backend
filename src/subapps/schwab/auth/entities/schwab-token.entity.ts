import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Single-row table: this backend manages one personal Schwab trading
 * account, not multi-tenant OAuth. accessToken/refreshToken are stored
 * AES-256-GCM encrypted (see token-encryption.util.ts), never in plaintext.
 */
@Entity('schwab_tokens')
export class SchwabToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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
