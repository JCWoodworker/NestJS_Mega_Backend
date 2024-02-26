import { PartialType } from '@nestjs/mapped-types';
import { CreateBizlinksfreeUserSettingsDto } from './create-bizlinksfree-user-settings.dto';

export class UpdateBizlinksfreeUserSettingsDto extends PartialType(
  CreateBizlinksfreeUserSettingsDto,
) {}
