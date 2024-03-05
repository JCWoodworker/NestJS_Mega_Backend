import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { IsUrl } from 'class-validator';
@Entity()
export class MycuttingboardLinks {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @IsUrl()
  link_url: string;

  @Column()
  link_display_name: string;

  @Column()
  created_at: Date;

  @Column()
  updated_at: Date;
}
