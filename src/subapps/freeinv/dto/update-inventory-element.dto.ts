import { PartialType } from '@nestjs/mapped-types';
import { CreateInventoryElementDto } from './create-inventory-element.dto';

export class UpdateInventoryElementDto extends PartialType(
  CreateInventoryElementDto,
) {}
