import { IsUrl } from 'class-validator';
import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';

import { OblCustomLinks } from './oblCustomLinks.entity';
import { OblSocialLinks } from './oblSocialLinks.entity';

@Entity()
export class OblBusinesses {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  domain: string;

  @Column()
  name: string;

  @Column()
  @IsUrl()
  logo?: string;

  @OneToMany(() => OblCustomLinks, (customLink) => customLink.business)
  customLinks: OblCustomLinks[];

  @OneToMany(() => OblSocialLinks, (socialLink) => socialLink.business)
  socialLinks: OblSocialLinks[];
}
