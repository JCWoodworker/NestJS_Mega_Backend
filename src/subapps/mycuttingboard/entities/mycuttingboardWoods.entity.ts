import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { IsUrl } from 'class-validator';

@Entity()
export class Woods {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  wood_name: string;

  @Column()
  wood_description: string;

  @Column()
  wood_region: string;

  @Column()
  wood_hardness: string;

  @Column()
  @IsUrl()
  wood_image_url: string;

  @Column()
  created_at: Date;

  @Column()
  updated_at: Date;
}
