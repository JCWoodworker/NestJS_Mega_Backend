import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsUUID } from 'class-validator';

import { CreateWallDto } from './create-wall.dto';

export class UpdateWallDto extends PartialType(CreateWallDto) {
  // Explicitly make room_id optional
  @IsOptional()
  @IsUUID()
  room_id?: string;
}
