import { PartialType } from '@nestjs/mapped-types';

import { CreateCustomLinkDto } from './create-custom-link.dto';

export class UpdateCustomLinkDto extends PartialType(CreateCustomLinkDto) {}
