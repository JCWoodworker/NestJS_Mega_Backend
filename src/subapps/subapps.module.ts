import { Module } from '@nestjs/common';
import { SubappsService } from './subapps.service';
import { SubappsController } from './subapps.controller';

@Module({
  controllers: [SubappsController],
  providers: [SubappsService],
})
export class SubappsModule {}
