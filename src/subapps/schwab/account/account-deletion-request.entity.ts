import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AccountDeletionStatus {
  PENDING = 'pending',
  REJECTED = 'rejected',
  FULFILLED = 'fulfilled',
  CANCELLED = 'cancelled',
}

@Entity('schwab_account_deletion_requests')
@Index('IDX_deletion_requests_user_status', ['userId', 'status'])
export class AccountDeletionRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 16, default: AccountDeletionStatus.PENDING })
  status: AccountDeletionStatus;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  /** Prefer emailing CSV export before admin fulfills the purge. */
  @Column({ type: 'boolean', name: 'email_export', default: true })
  emailExport: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', name: 'resolved_at', nullable: true })
  resolvedAt: Date | null;

  @Column({ type: 'varchar', name: 'resolved_by', nullable: true })
  resolvedBy: string | null;

  @Column({ type: 'text', name: 'resolution_note', nullable: true })
  resolutionNote: string | null;
}
