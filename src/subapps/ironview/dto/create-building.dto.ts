import {
  IsString,
  IsOptional,
  IsDateString,
  MaxLength,
  IsPostalCode,
  MinLength,
  IsNotEmpty,
} from 'class-validator';

export class CreateBuildingDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  state?: string;

  @IsOptional()
  @IsPostalCode('US')
  @MaxLength(20)
  zip_code?: string;

  @IsOptional()
  @IsDateString()
  construction_date?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
