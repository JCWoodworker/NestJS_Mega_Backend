import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import authConfig from '@config/auth.config';

import { IronviewModule } from './ironview/ironview.module';
import { MycuttingboardModule } from './mycuttingboard/mycuttingboard.module';
import { OnlyBizlinksModule } from './onlybizlinks/onlybizlinks.module';
import { SubappsController } from './subapps.controller';
import { SubappsService } from './subapps.service';

@Module({
  imports: [
    ConfigModule.forFeature(authConfig),
    MycuttingboardModule,
    OnlyBizlinksModule,
    IronviewModule,
  ],
  controllers: [SubappsController],
  providers: [SubappsService],
})
export class SubappsModule {}
