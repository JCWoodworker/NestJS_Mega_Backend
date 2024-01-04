import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Room {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  description: string;

  @Column()
  parentId: number;

  @Column()
  type: string;

  @Column()
  parentType: string;

  @Column()
  created_at: Date;

  @Column()
  updated_at: Date;
}
