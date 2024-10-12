import { IsUrl } from 'class-validator';
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class MrlRestaurants {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  @IsUrl()
  logo: string;

  @Column()
  domain: string;
}
