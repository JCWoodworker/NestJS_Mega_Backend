import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsUUID, IsInt } from 'class-validator';

import { CreateAreaDto } from './create-area.dto';

export class UpdateAreaDto extends PartialType(CreateAreaDto) {
  // Explicitly make foreign keys optional if needed for clarity or specific validation
  // Usually, you might not allow changing the floor or area_type via a simple PATCH update.
  @IsOptional()
  @IsUUID()
  floor_id?: string;

  @IsOptional()
  @IsInt()
  area_type_id?: number;
}
