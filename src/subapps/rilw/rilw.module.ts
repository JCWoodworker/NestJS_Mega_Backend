import { Module } from '@nestjs/common';
import { RilwService } from './rilw.service';
import { RilwController } from './rilw.controller';

@Module({
  controllers: [RilwController],
  providers: [RilwService],
})
export class RilwModule {}
