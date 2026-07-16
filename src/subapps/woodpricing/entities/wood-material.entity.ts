import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { MeasurementType } from '../enums/measurement-type.enum';

@Entity('woodpricing_materials')
@Index(['species', 'measurementType', 'thickness'], { unique: true })
export class WoodMaterial {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 150 })
  species: string;

  @Column({
    type: 'enum',
    enum: MeasurementType,
    name: 'measurement_type',
  })
  measurementType: MeasurementType;

  @Column({ type: 'varchar', length: 10, nullable: true })
  thickness: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'unit_price' })
  unitPrice: number;

  @Column({ type: 'jsonb', nullable: true })
  dimensions: Record<string, unknown> | null;

  @UpdateDateColumn({ name: 'last_updated' })
  lastUpdated: Date;
}
