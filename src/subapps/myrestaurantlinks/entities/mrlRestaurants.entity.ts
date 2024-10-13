import { IsUrl } from 'class-validator';
import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { MrlCustomLinks } from './mrlCustomLinks.entity';

@Entity()
export class MrlRestaurants {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  @IsUrl()
  logo?: string;

  @Column()
  domain: string;

  @OneToMany(() => MrlCustomLinks, (customLink) => customLink.restaurant_id)
  customLinks: MrlCustomLinks[];
}
