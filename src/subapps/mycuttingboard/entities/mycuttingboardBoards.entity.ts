import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Boards {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: string;

  @Column()
  board_type: string;

  @Column()
  board_description: string;

  @Column()
  created_at: Date;

  @Column()
  updated_at: Date;
}
