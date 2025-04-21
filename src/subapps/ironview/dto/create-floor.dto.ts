import {
  IsString,
  IsOptional,
  MaxLength,
  IsUUID,
  IsNotEmpty,
  MinLength,
  IsUrl,
} from 'class-validator';

export class CreateFloorDto {
  @IsUUID()
  @IsNotEmpty()
  building_id: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(50)
  floor_number: string; // "1", "G", "B1"

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string; // "Ground Floor"

  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  blueprint_url?: string;
}
