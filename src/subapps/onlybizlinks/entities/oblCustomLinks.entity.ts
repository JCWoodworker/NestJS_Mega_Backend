import { IsUrl } from 'class-validator';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { OblBusinesses } from './oblBusinesses.entity';

@Entity()
export class OblCustomLinks {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => OblBusinesses, (business) => business.customLinks)
  @JoinColumn({ name: 'business_id' })
  business: OblBusinesses;

  @Column()
  business_id: number;

  @Column()
  title: string;

  @Column()
  @IsUrl()
  url: string;
}
