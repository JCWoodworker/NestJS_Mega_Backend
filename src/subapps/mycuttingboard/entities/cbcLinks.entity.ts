import { IsUrl } from 'class-validator';
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
@Entity()
export class CbcLinks {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  user_id: string;

  @Column({ nullable: false })
  @IsUrl()
  url: string;

  @Column({ nullable: false })
  title: string;

  @Column()
  notes: string;

  @Column()
  created_at: Date;

  @Column()
  updated_at: Date;
}
