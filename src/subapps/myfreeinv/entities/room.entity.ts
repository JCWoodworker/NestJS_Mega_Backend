import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { MyfreeinvLocations } from './location.entity';
import { MyfreeinvItems } from './item.entity';
import { IsBoolean } from 'class-validator';

@Entity()
export class MyfreeinvRooms {
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

  @ManyToOne(() => MyfreeinvLocations, (locations) => locations.rooms)
  location: MyfreeinvLocations;

  @OneToMany(() => MyfreeinvItems, (items) => items.room)
  items: MyfreeinvItems[];

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
