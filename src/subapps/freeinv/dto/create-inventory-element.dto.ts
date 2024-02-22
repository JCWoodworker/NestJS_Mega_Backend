import { IsString, IsEnum, IsOptional } from 'class-validator';
import { InventoryElementType } from './dto.enum';

export class CreateInventoryElementDto {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsEnum(InventoryElementType)
  type: string;

  @IsOptional()
  locationId?: number;

  @IsOptional()
  roomId?: number;
}
