import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { Locations } from './location.entity';
import { Items } from './item.entity';
import { IsBoolean } from 'class-validator';

@Entity()
export class Rooms {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  description: string;

  @Column()
  type: string;

  @Column()
  locationId: number;

  @ManyToOne(() => Locations, (locations) => locations.rooms)
  location: Locations;

  @OneToMany(() => Items, (items) => items.room)
  items: Items[];

  @Column()
  userId: string;

  @Column()
  image_url: string;

  @Column({ default: false })
  @IsBoolean()
  orphan_room: boolean;

  @Column()
  created_at: Date;

  @Column()
  updated_at: Date;
}
