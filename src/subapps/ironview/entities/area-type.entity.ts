import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Area } from './area.entity';

@Entity('area_types')
export class AreaType {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ unique: true, length: 100 })
  type_name: string; // 'Apartment', 'Office', 'Stairwell', etc.

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // --- Relationships ---
  @OneToMany(() => Area, (area) => area.areaType)
  areas: Area[];
}
