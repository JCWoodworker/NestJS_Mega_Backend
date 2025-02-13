import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import authConfig from '@config/auth.config';

import { MycuttingboardModule } from './mycuttingboard/mycuttingboard.module';
import { OnlyBizlinksModule } from './onlybizlinks/onlybizlinks.module';

import { SubappsService } from './subapps.service';
import { SubappsController } from './subapps.controller';

@Module({
  imports: [
    ConfigModule.forFeature(authConfig),
    MycuttingboardModule,
    OnlyBizlinksModule,
  ],
  controllers: [SubappsController],
  providers: [SubappsService],
})
export class SubappsModule {}
