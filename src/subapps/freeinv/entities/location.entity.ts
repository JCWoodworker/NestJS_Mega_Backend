import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Rooms } from './room.entity';
import { IsBoolean } from 'class-validator';
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
  userId: string;

  @Column()
  image_url: string;

  @Column({ default: false })
  @IsBoolean()
  orphan_location: boolean;

  @Column()
  created_at: Date;

  @Column()
  updated_at: Date;
}
