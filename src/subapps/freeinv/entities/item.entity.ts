import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Rooms } from './room.entity';

@Entity()
export class Items {
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

  @ManyToOne(() => Rooms, (room) => room.items)
  room: Rooms;

  @Column()
  created_at: Date;

  @Column()
  updated_at: Date;
}
