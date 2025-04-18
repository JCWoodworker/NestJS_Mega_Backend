import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Wall } from './wall.entity';

@Entity('wall_images')
export class WallImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 2048 })
  image_url: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  stage: string | null;
  // 'Framing', 'Electrical Rough-in', 'Plumbing Rough-in', 'Drywall', 'Painting', 'Finishing', 'Other'

  @Column({ type: 'timestamp with time zone', nullable: true })
  taken_at: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  uploaded_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // --- Relationships ---
  @ManyToOne(() => Wall, (wall) => wall.images, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'wall_id' })
  wall: Wall;
}
