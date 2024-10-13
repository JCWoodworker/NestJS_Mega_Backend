import { IsEnum, IsUrl } from 'class-validator';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { MrlRestaurants } from './mrlRestaurants.entity';

enum SocialMediaPlatform {
  FACEBOOK = 'facebook',
  INSTAGRAM = 'instagram',
  X = 'x',
  LINKEDIN = 'linkedin',
  YOUTUBE = 'youtube',
  PINTEREST = 'pinterest',
}

@Entity()
export class MrlSocialLinks {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => MrlRestaurants, (restaurant) => restaurant.socialLinks)
  @JoinColumn({ name: 'restaurant_id' })
  restaurant: MrlRestaurants;

  @Column()
  restaurant_id: number;

  @Column()
  @IsEnum(SocialMediaPlatform)
  social_media_platform: SocialMediaPlatform;

  @Column()
  @IsUrl()
  url: string;

  @Column({ default: true })
  is_active: boolean;
}
