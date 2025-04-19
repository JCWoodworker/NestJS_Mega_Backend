import {
  IsString,
  IsOptional,
  MaxLength,
  IsUUID,
  IsInt,
  Min,
  IsNotEmpty,
  MinLength,
} from 'class-validator';

export class CreateAreaDto {
  @IsUUID()
  @IsNotEmpty()
  floor_id: string;

  @IsInt()
  @IsNotEmpty()
  area_type_id: number;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  unit_number: string; // "Apt 101", "Stairwell A"

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string; // "John Doe's Office", "Unit 101", "Stairwell A"

  @IsOptional()
  @IsInt()
  @Min(0)
  sq_footage?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
