import { Module } from '@nestjs/common';
import { ScoutService } from './scout.service';
import { ScoutController } from './scout.controller';

@Module({
  controllers: [ScoutController],
  providers: [ScoutService],
})
export class ScoutModule {}
