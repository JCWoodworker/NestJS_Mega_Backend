import { Module } from '@nestjs/common';
import { MycuttingboardService } from './mycuttingboard.service';
import { MycuttingboardController } from './mycuttingboard.controller';

@Module({
  controllers: [MycuttingboardController],
  providers: [MycuttingboardService],
})
export class MycuttingboardModule {}
