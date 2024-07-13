import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { IsUrl } from 'class-validator';
@Entity()
export class CbcLinks {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @IsUrl()
  url: string;

  @Column()
  title: string;

  @Column()
  notes: string;

  @Column()
  created_at: Date;

  @Column()
  updated_at: Date;
}
