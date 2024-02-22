import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import authConfig from 'src/config/auth.config';

import { BizlinksfreeController } from './bizlinksfree.controller';
import { BizlinksfreeService } from './bizlinksfree.service';

import { BizlinksfreeUserSettings } from './entities/bizlinksfreeUserSettings.entity';
import { BizlinksfreeUrl } from './entities/bizlinksfreeUrl.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([BizlinksfreeUserSettings, BizlinksfreeUrl]),
    ConfigModule.forFeature(authConfig),
  ],
  controllers: [BizlinksfreeController],
  providers: [BizlinksfreeService],
})
export class BizlinksfreeModule {}
