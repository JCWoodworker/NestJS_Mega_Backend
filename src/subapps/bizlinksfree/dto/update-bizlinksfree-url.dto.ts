import { PartialType } from '@nestjs/mapped-types';
import { CreateBizlinksfreeUrlDto } from './create-bizlinksfree-url.dto';

export class UpdateBizlinksfreeUrlDto extends PartialType(
  CreateBizlinksfreeUrlDto,
) {}
