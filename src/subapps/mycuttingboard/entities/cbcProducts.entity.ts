import { IsEnum, IsUrl } from 'class-validator';
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

enum CbcProductEnum {
  BOARD = 'board',
  COASTER = 'coaster',
}

@Entity()
export class CbcProduct {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: string;

  @Column()
  @IsEnum(CbcProductEnum)
  type: string;

  @Column()
  title: string;

  @Column()
  description: string;

  @Column()
  customer_message: string;

  @Column()
  @IsUrl()
  image_url: string;

  @Column()
  created_at: Date;

  @Column()
  updated_at: Date;
}
