import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Rooms } from './room.entity';

@Entity()
export class Locations {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  description: string;

  @Column()
  type: string;

  @OneToMany(() => Rooms, (rooms) => rooms.location)
  rooms: Rooms[];

  @Column()
  created_at: Date;

  @Column()
  updated_at: Date;
}
