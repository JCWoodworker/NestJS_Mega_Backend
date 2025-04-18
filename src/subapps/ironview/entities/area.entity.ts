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

import { AreaType } from './area-type.entity';
import { Floor } from './floor.entity';
import { Room } from './room.entity';

@Entity('areas')
export class Area {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 }) // "Apt 101", "Stairwell A", "Maintenance Room", "Conference Room", "Lobby"
  unit_number: string;

  @Column({ length: 255, nullable: true })
  name: string | null; // "John Doe's Office"

  @Column({ type: 'int', nullable: true })
  sq_footage: number | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // --- Relationships ---
  @ManyToOne(() => Floor, (floor) => floor.areas, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'floor_id' })
  floor: Floor;

  @ManyToOne(() => AreaType, (type) => type.areas, {
    eager: true,
    nullable: false,
  })
  @JoinColumn({ name: 'area_type_id' })
  areaType: AreaType;

  @OneToMany(() => Room, (room) => room.area)
  rooms: Room[];
}
