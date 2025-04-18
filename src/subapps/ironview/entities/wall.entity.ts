import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

import { Room } from './room.entity';
import { WallImage } from './wall-image.entity';

@Entity('walls')
export class Wall {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  identifier: string; // "North Wall", "Wall with Thermostat"

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  approx_length_ft: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  approx_height_ft: number | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Index()
  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  nfc_tag_id: string | null;

  @Index()
  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  qr_code_id: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // --- Relationships ---
  @ManyToOne(() => Room, (room) => room.walls, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'room_id' })
  room: Room;

  @OneToMany(() => WallImage, (image) => image.wall)
  images: WallImage[];
}
