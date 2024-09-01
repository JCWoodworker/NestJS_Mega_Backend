import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class CbcUserAndProduct {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: string;

  @Column()
  product_id: number;

  @Column()
  created_at: Date;

  @Column()
  updated_at: Date;
}
