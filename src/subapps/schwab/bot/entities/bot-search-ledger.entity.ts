import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { SearchSummary } from '../bot-propose-search';

/** One Saturday search, including weeks that do not open a pull request. */
@Entity('bot_search_ledger')
@Index('UQ_bot_search_ledger_user_week', ['userId', 'weekEndingEt'], {
  unique: true,
})
export class BotSearchLedger {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 10, name: 'week_ending_et' })
  weekEndingEt: string;

  @Column({ type: 'jsonb' })
  body: SearchSummary;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
