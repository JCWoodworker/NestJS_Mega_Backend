import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Locations {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  description: string;

  @Column()
  parentId: string;

  @Column()
  type: string;

  @Column()
  parentType: string;

  @Column()
  created_at: Date;

  @Column()
  updated_at: Date;
}
