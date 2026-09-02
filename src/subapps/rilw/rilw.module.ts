import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { RilwController } from './rilw.controller';
import { RilwService } from './rilw.service';

@Module({
  imports: [ConfigModule],
  controllers: [RilwController],
  providers: [RilwService],
})
export class RilwModule {}
