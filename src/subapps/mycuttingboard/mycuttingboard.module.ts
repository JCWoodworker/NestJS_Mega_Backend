import { Module } from '@nestjs/common';
import { MycuttingboardController } from './mycuttingboard.controller';
import { MycuttingboardService } from './mycuttingboard.service';
import { BoardsService } from './resources/services/boards.service';
import { LinksService } from './resources/services/links.service';
import { WoodsService } from './resources/services/woods.service';

@Module({
  controllers: [MycuttingboardController],
  providers: [MycuttingboardService, BoardsService, LinksService, WoodsService],
})
export class MycuttingboardModule {}
