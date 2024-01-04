import { Module } from '@nestjs/common';
import { FreeinvService } from './freeinv.service';
import { FreeinvController } from './freeinv.controller';

@Module({
  controllers: [FreeinvController],
  providers: [FreeinvService],
})
export class FreeinvModule {}
