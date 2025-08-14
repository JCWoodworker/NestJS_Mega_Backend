import { PartialType } from '@nestjs/mapped-types';
import { CreateRilwDto } from './create-rilw.dto';

export class UpdateRilwDto extends PartialType(CreateRilwDto) {}
