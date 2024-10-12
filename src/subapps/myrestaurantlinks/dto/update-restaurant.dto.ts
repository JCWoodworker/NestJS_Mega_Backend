import { PartialType } from '@nestjs/mapped-types';
import { CreateRestaurantDto } from './create-restaurant.dto';

export class UpdateMyrestaurantlinkDto extends PartialType(
  CreateRestaurantDto,
) {}
