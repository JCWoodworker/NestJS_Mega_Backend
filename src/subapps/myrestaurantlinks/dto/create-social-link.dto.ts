import {
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsBoolean,
} from 'class-validator';

export class CreateSocialLinkDto {
  @IsNumber()
  restaurant_id: number;

  @IsUrl()
  url: string;

  @IsString()
  social_media_platform: string;

  @IsOptional()
  @IsBoolean()
  is_active: boolean;
}
