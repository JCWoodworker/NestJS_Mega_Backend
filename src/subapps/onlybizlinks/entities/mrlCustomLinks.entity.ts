import { IsUrl } from 'class-validator';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { MrlBusinesses } from './mrlBusinesses.entity';

@Entity()
export class MrlCustomLinks {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => MrlBusinesses, (business) => business.customLinks)
  @JoinColumn({ name: 'business_id' })
  business: MrlBusinesses;

  @Column()
  business_id: number;

  @Column()
  title: string;

  @Column()
  @IsUrl()
  url: string;
}
