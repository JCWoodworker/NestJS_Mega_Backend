import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class CbcProductAndWoods {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  product_id: string;

  @Column()
  wood_id: string;

  @Column()
  created_at: Date;

  @Column()
  updated_at: Date;
}
