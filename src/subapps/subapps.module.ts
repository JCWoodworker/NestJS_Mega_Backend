import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import authConfig from '@config/auth.config';

import { IronviewModule } from './ironview/ironview.module';
import { MycuttingboardModule } from './mycuttingboard/mycuttingboard.module';
import { MywoodappModule } from './mywoodapp/mywoodapp.module';
import { OnlyBizlinksModule } from './onlybizlinks/onlybizlinks.module';
import { RilwModule } from './rilw/rilw.module';
import { SubappsController } from './subapps.controller';
import { SubappsService } from './subapps.service';

@Module({
  imports: [
    ConfigModule.forFeature(authConfig),
    MycuttingboardModule,
    OnlyBizlinksModule,
    IronviewModule,
    RilwModule,
    MywoodappModule,
  ],
  controllers: [SubappsController],
  providers: [SubappsService],
})
export class SubappsModule {}
