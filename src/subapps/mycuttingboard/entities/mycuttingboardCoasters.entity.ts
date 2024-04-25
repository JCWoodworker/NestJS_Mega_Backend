import { IsUrl } from 'class-validator';
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class MycuttingboardCoasters {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: string;

  @Column()
  coaster_type: string;

  @Column()
  coaster_description: string;

  @Column()
  customer_message: string;

  @Column()
  @IsUrl()
  coaster_image_url: string;

  @Column()
  created_at: Date;

  @Column()
  updated_at: Date;
}
