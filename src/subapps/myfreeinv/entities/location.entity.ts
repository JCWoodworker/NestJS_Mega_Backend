import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { MyfreeinvRooms } from './room.entity';
import { IsBoolean } from 'class-validator';
@Entity()
export class MyfreeinvLocations {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  description: string;

  @Column()
  type: string;

  @OneToMany(() => MyfreeinvRooms, (rooms) => rooms.location)
  rooms: MyfreeinvRooms[];

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
