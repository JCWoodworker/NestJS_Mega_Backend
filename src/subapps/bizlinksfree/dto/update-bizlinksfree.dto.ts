import { PartialType } from '@nestjs/mapped-types';
import { CreateBizlinksfreeDto } from './create-bizlinksfree.dto';

export class UpdateBizlinksfreeDto extends PartialType(CreateBizlinksfreeDto) {}
