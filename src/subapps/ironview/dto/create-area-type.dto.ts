import {
  IsString,
  IsOptional,
  MaxLength,
  MinLength,
  IsNotEmpty,
} from 'class-validator';

export class CreateAreaTypeDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  type_name: string; // "Apartment", "Office", "Other"

  @IsOptional()
  @IsString()
  description?: string;
}
