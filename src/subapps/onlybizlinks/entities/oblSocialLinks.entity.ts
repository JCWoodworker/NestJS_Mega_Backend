import { IsEnum, IsUrl } from 'class-validator';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { OblBusinesses } from './oblBusinesses.entity';

export enum SocialMediaPlatform {
  FACEBOOK = 'facebook',
  INSTAGRAM = 'instagram',
  LINKEDIN = 'linkedin',
  PINTEREST = 'pinterest',
  X = 'x',
  YOUTUBE = 'youtube',
}

@Entity()
export class OblSocialLinks {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => OblBusinesses, (business) => business.socialLinks)
  @JoinColumn({ name: 'business_id' })
  business: OblBusinesses;

  @Column()
  business_id: number;

  @Column()
  @IsEnum(SocialMediaPlatform)
  social_media_platform: SocialMediaPlatform;

  @Column()
  @IsUrl()
  url: string;

  @Column({ default: true })
  is_active: boolean;
}
