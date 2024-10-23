import { IsEnum, IsUrl } from 'class-validator';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { MrlBusinesses } from './mrlBusinesses.entity';

export enum SocialMediaPlatform {
  FACEBOOK = 'facebook',
  INSTAGRAM = 'instagram',
  LINKEDIN = 'linkedin',
  PINTEREST = 'pinterest',
  X = 'x',
  YOUTUBE = 'youtube',
}

@Entity()
export class MrlSocialLinks {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => MrlBusinesses, (business) => business.socialLinks)
  @JoinColumn({ name: 'restaurant_id' })
  business: MrlBusinesses;

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
