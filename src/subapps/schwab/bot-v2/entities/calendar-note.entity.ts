import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** One journal note per user per day, week, or month. Shared across books. */
@Entity('calendar_notes')
@Index(['userId', 'grain', 'periodKey'], { unique: true })
export class CalendarNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar' })
  grain: 'day' | 'week' | 'month';

  @Column({ type: 'varchar', name: 'period_key' })
  periodKey: string;

  @Column({ type: 'text' })
  body: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
