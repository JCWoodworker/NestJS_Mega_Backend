import {
  IsString,
  IsOptional,
  MaxLength,
  IsUUID,
  IsUrl,
  IsNotEmpty,
  IsDateString,
} from 'class-validator';

export class CreateWallImageDto {
  @IsUUID()
  @IsNotEmpty()
  wall_id: string;

  @IsUrl()
  @IsNotEmpty()
  @MaxLength(2048)
  image_url: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  stage?: string;
  // 'Framing', 'Electrical Rough-in', 'Plumbing Rough-in', 'Drywall', 'Painting', 'Flooring', 'Other'

  @IsOptional()
  @IsDateString()
  taken_at?: string;
}
