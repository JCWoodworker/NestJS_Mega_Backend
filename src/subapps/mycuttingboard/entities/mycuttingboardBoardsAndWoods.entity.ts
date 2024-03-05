import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class MycuttingboardBoardsAndWoods {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  board_id: string;

  @Column()
  wood_id: string;

  @Column()
  created_at: Date;

  @Column()
  updated_at: Date;
}
