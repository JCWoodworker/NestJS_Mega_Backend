import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Area } from './area.entity';
import { Building } from './building.entity';

@Entity('floors')
export class Floor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 }) // "1", "G", "B1"
  floor_number: string;

  @Column({ length: 255, nullable: true })
  name: string | null; // "Ground Floor"

  @Column({ type: 'varchar', length: 2048, nullable: true })
  blueprint_url: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // --- Relationships ---
  @ManyToOne(() => Building, (building) => building.floors, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'building_id' })
  building: Building;

  @OneToMany(() => Area, (area) => area.floor)
  areas: Area[];
}
