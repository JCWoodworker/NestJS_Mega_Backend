import { PartialType } from '@nestjs/mapped-types';

import { CreateUserAndBusinessDto } from './create-user-and-business.dto';

export class UpdateUserAndBusinessDto extends PartialType(
  CreateUserAndBusinessDto,
) {}
