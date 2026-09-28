import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** One Saturday propose run. The packet is the analyzer's verdict. */
@Entity('bot_proposals')
export class BotProposal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 10, name: 'week_ending_et' })
  weekEndingEt: string;

  @Column({ type: 'boolean', default: false })
  actionable: boolean;

  @Column({ type: 'jsonb' })
  packet: Record<string, unknown>;

  @Column({ type: 'varchar', length: 32, default: 'draft' })
  status: string;

  @Column({ type: 'timestamptz', name: 'applied_at', nullable: true })
  appliedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
