import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsUUID } from 'class-validator';

import { CreateRoomDto } from './create-room.dto';

export class UpdateRoomDto extends PartialType(CreateRoomDto) {
  // Explicitly make area_id optional
  @IsOptional()
  @IsUUID()
  area_id?: string;
}
