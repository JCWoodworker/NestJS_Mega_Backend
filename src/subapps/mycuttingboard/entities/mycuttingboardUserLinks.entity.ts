import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class UserLinks {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: string;

  @Column()
  link_id: string;

  @Column()
  created_at: Date;

  @Column()
  updated_at: Date;
}
