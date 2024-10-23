import { IsUrl } from 'class-validator';
import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';

import { MrlCustomLinks } from './mrlCustomLinks.entity';
import { MrlSocialLinks } from './mrlSocialLinks.entity';

@Entity()
export class MrlRestaurants {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  domain: string;

  @Column()
  name: string;

  @Column()
  @IsUrl()
  logo?: string;

  @OneToMany(() => MrlCustomLinks, (customLink) => customLink.restaurant)
  customLinks: MrlCustomLinks[];

  @OneToMany(() => MrlSocialLinks, (socialLink) => socialLink.restaurant)
  socialLinks: MrlSocialLinks[];
}
