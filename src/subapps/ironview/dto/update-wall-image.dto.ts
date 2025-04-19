import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsUUID } from 'class-validator';

import { CreateWallImageDto } from './create-wall-image.dto';

export class UpdateWallImageDto extends PartialType(CreateWallImageDto) {
  // Explicitly make wall_id optional
  @IsOptional()
  @IsUUID()
  wall_id?: string;

  // You might disallow changing the image_url via update,
  // as it often involves deleting the old file and uploading a new one.
  // If so, you could add: @IsEmpty({ message: 'image_url cannot be updated directly' })
}
