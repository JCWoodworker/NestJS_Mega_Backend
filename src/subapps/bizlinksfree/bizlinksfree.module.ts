import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import authConfig from 'src/config/auth.config';

import { BizlinksfreeController } from './bizlinksfree.controller';
import { BizlinksfreeUserSettingsService } from './resources/services/bizlinksfreeUserSettings.service';
import { BizlinksfreeUrlService } from './resources/services/bizlinksfreeUrl.service';

import { BizlinksfreeUserSettings } from './entities/bizlinksfreeUserSettings.entity';
import { BizlinksfreeUrl } from './entities/bizlinksfreeUrl.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([BizlinksfreeUserSettings, BizlinksfreeUrl]),
    ConfigModule.forFeature(authConfig),
  ],
  controllers: [BizlinksfreeController],
  providers: [BizlinksfreeUserSettingsService, BizlinksfreeUrlService],
})
export class BizlinksfreeModule {}
