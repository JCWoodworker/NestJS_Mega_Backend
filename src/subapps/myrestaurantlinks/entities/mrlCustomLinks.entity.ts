import { IsUrl } from 'class-validator';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { MrlRestaurants } from './mrlRestaurants.entity';

@Entity()
export class MrlCustomLinks {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => MrlRestaurants, (restaurant) => restaurant.customLinks)
  @JoinColumn({ name: 'restaurant_id' })
  restaurant: MrlRestaurants;

  @Column()
  restaurant_id: number;

  @Column()
  title: string;

  @Column()
  @IsUrl()
  url: string;
}
