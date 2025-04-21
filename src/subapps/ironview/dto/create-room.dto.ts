import {
  IsString,
  IsOptional,
  MaxLength,
  IsUUID,
  IsNotEmpty,
  MinLength,
} from 'class-validator';

export class CreateRoomDto {
  @IsUUID()
  @IsNotEmpty()
  area_id: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(255)
  name: string; // "Living Room", "Bedroom 1", "Kitchen", "Bathroom", "Office", "Other"

  @IsOptional()
  @IsString()
  notes?: string;
}
