import { PartialType } from '@nestjs/mapped-types';
import { CreateCoasterDto } from './create-coaster.dto';
export class UpdateCoasterDto extends PartialType(CreateCoasterDto) {}
