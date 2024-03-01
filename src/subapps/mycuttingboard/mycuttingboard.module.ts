import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MycuttingboardController } from './mycuttingboard.controller';
import { BoardsController } from './resources/controllers/boards.controller';
import { LinksController } from './resources/controllers/links.controller';
import { WoodsController } from './resources/controllers/woods.controller';

import { MycuttingboardService } from './mycuttingboard.service';
import { BoardsService } from './resources/services/boards.service';
import { LinksService } from './resources/services/links.service';
import { WoodsService } from './resources/services/woods.service';

import { Boards } from './entities/mycuttingboardBoards.entity';
import { Links } from './entities/mycuttingboardLinks.entity';
import { Woods } from './entities/mycuttingboardWoods.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Boards, Links, Woods])],
  controllers: [
    MycuttingboardController,
    BoardsController,
    LinksController,
    WoodsController,
  ],
  providers: [MycuttingboardService, BoardsService, LinksService, WoodsService],
})
export class MycuttingboardModule {}
