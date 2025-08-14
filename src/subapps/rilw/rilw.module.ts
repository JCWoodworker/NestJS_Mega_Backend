import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RilwService } from './rilw.service';
import { RilwController } from './rilw.controller';

@Module({
  imports: [ConfigModule],
  controllers: [RilwController],
  providers: [RilwService],
})
export class RilwModule {}
