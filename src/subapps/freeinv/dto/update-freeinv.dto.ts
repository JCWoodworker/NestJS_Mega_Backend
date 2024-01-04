import { PartialType } from '@nestjs/mapped-types';
import { CreateFreeinvDto } from './create-freeinv.dto';

export class UpdateFreeinvDto extends PartialType(CreateFreeinvDto) {}
