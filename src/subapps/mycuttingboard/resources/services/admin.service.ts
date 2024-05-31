import { Injectable } from '@nestjs/common';

import { BoardsService } from './boards.service';
import { CoastersService } from './coasters.service';
// import { WoodsService } from './woods.service';

import { MycuttingboardBoards } from '../../entities/mycuttingboardBoards.entity';
import { MycuttingboardCoasters } from '../../entities/mycuttingboardCoasters.entity';
// import { MycuttingboardWoods } from '../../entities/mycuttingboardWoods.entity';

@Injectable()
export class AdminService {
  constructor(
    private boardsService: BoardsService,
    private coastersService: CoastersService,
  ) {}

  async getTestMessage() {
    return {
      message: 'This message will only show to users with admin access',
    };
  }

  /*
  CUTTING BOARD SERVICES
  */

  async getBoardDataById(id: number) {
    return await this.boardsService.getBoardDataById(id);
  }

  async addBoardData(boardData: MycuttingboardBoards) {
    return await this.boardsService.addBoardData(boardData);
  }

  async deleteBoardData(id: number) {
    return await this.boardsService.deleteBoardData(id);
  }

  /*
  COASTER SERVICES
  */

  async getCoasterDataById(id: number) {
    return await this.coastersService.getCoasterDataById(id);
  }

  async addCoasterData(coasterData: MycuttingboardCoasters) {
    return await this.coastersService.addCoasterData(coasterData);
  }

  async deleteCoasterData(id: number) {
    return await this.coastersService.deleteCoasterData(id);
  }
}
