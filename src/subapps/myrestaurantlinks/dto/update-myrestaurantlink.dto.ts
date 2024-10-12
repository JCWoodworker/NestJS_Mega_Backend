import { PartialType } from '@nestjs/mapped-types';
import { CreateMyrestaurantlinkDto } from './create-myrestaurantlink.dto';

export class UpdateMyrestaurantlinkDto extends PartialType(CreateMyrestaurantlinkDto) {}
