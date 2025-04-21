import {
  IsString,
  IsOptional,
  MaxLength,
  IsUUID,
  IsNumber,
  Min,
  IsNotEmpty,
  MinLength,
} from 'class-validator';

export class CreateWallDto {
  @IsUUID()
  @IsNotEmpty()
  room_id: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(255)
  identifier: string; // "North Wall", "Wall with Thermostat", "Wall with Window"

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  approx_length_ft?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  approx_height_ft?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  // Add validation if NFC IDs have a specific format
  nfc_tag_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  // Add validation if QR codes have a specific format
  qr_code_id?: string;
}
