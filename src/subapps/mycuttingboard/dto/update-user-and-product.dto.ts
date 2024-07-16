import { PartialType } from '@nestjs/mapped-types';
import { CreateUserAndProductDto } from './create-user-and-product.dto';

export class UpdateUserAndProductDto extends PartialType(
  CreateUserAndProductDto,
) {}
