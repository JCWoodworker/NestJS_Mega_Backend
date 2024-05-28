import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MycuttingboardController } from './mycuttingboard.controller';
import { CoastersController } from './resources/controllers/coasters.controller';
import { BoardsController } from './resources/controllers/boards.controller';
import { LinksController } from './resources/controllers/links.controller';
import { WoodsController } from './resources/controllers/woods.controller';

import { MycuttingboardService } from './mycuttingboard.service';
import { CoastersService } from './resources/services/coasters.service';
import { BoardsService } from './resources/services/boards.service';
import { LinksService } from './resources/services/links.service';
import { WoodsService } from './resources/services/woods.service';
import { AdminService } from './resources/services/admin.service';

import { MycuttingboardBoards } from './entities/mycuttingboardBoards.entity';
import { MycuttingboardCoasters } from './entities/mycuttingboardCoasters.entity';
import { MycuttingboardLinks } from './entities/mycuttingboardLinks.entity';
import { MycuttingboardWoods } from './entities/mycuttingboardWoods.entity';
import { AdminController } from './resources/controllers/admin.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MycuttingboardBoards,
      MycuttingboardCoasters,
      MycuttingboardLinks,
      MycuttingboardWoods,
    ]),
  ],
  controllers: [
    MycuttingboardController,
    CoastersController,
    BoardsController,
    LinksController,
    WoodsController,
    AdminController,
  ],
  providers: [
    MycuttingboardService,
    CoastersService,
    BoardsService,
    LinksService,
    WoodsService,
    AdminService,
  ],
})
export class MycuttingboardModule {}
