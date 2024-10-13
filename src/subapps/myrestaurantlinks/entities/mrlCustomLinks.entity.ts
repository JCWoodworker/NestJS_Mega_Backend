import { IsUrl } from 'class-validator';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { MrlRestaurants } from './mrlRestaurants.entity';

@Entity()
export class MrlCustomLinks {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => MrlRestaurants, (restaurant) => restaurant.customLinks)
  restaurant_id: MrlRestaurants;

  @Column()
  title: string;

  @Column()
  @IsUrl()
  url?: string;
}
