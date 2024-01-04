import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { Locations } from './location.entity';
import { Items } from './item.entity';

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
  created_at: Date;

  @Column()
  updated_at: Date;
}
