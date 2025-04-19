import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsUUID } from 'class-validator';

import { CreateFloorDto } from './create-floor.dto';

export class UpdateFloorDto extends PartialType(CreateFloorDto) {
  // Explicitly make building_id optional, as PartialType might not correctly infer
  // it's okay to omit when updating (usually you don't change the parent building).
  // If you DO want to allow changing the parent building via update, remove this override.
  @IsOptional()
  @IsUUID()
  building_id?: string;
}
