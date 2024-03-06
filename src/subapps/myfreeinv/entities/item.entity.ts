import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { MyfreeinvRooms } from './room.entity';

@Entity()
export class MyfreeinvItems {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  description: string;

  @Column()
  type: string;

  @Column()
  roomId: number;

  @ManyToOne(() => MyfreeinvRooms, (room) => room.items)
  room: MyfreeinvRooms;

  @Column()
  userId: string;

  @Column()
  image_url: string;

  @Column()
  created_at: Date;

  @Column()
  updated_at: Date;
}
