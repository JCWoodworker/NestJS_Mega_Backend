import {
  IsNumber,
  IsOptional,
  IsEnum,
  IsUrl,
  IsBoolean,
} from 'class-validator';

import { SocialMediaPlatform } from '../entities/oblSocialLinks.entity'; // Make sure to import the enum

export class CreateSocialLinkDto {
  @IsNumber()
  business_id: number;

  @IsUrl()
  url: string;

  @IsEnum(SocialMediaPlatform)
  social_media_platform: SocialMediaPlatform;

  @IsOptional()
  @IsBoolean()
  is_active: boolean;
}
