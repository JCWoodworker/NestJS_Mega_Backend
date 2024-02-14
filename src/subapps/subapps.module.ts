import { Module } from '@nestjs/common';
import { SubappsService } from './subapps.service';
import { SubappsController } from './subapps.controller';
import { FreeinvModule } from './freeinv/freeinv.module';

@Module({
  controllers: [SubappsController],
  providers: [SubappsService],
  imports: [FreeinvModule],
})
export class SubappsModule {}
