import { PartialType } from '@nestjs/mapped-types';
import { CreateMycuttingboardDto } from './create-mycuttingboard.dto';

export class UpdateMycuttingboardDto extends PartialType(CreateMycuttingboardDto) {}
