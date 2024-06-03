import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { BoardsService } from './boards.service';
import { CoastersService } from './coasters.service';
import { MycuttingboardBoards } from '../../entities/mycuttingboardBoards.entity';
import { MycuttingboardCoasters } from '../../entities/mycuttingboardCoasters.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(MycuttingboardBoards)
    private boardsRepository: Repository<MycuttingboardBoards>,
    @InjectRepository(MycuttingboardCoasters)
    private coastersRepository: Repository<MycuttingboardCoasters>,
    private boardsService: BoardsService,
    private coastersService: CoastersService,
  ) {}

  async getTestMessage() {
    return {
      message: 'This message will only show to users with admin access',
    };
  }

  async getAllProductData() {
    const boards = await this.boardsService.getAllBoardData();
    const coasters = await this.coastersService.getAllCoasterData();
    // const woods = await this.woodsService.getAllWoodsData();
    return { boards, coasters };
  }

  async addNewProduct(product: any) {
    if (product.category === 'board') {
      debugger;
      return await this.boardsRepository.save(product.newProduct);
    } else if (product.category === 'coaster') {
      debugger;
      return await this.coastersRepository.save(product.newProduct);
    } else {
      debugger;
      throw new HttpException(
        'Invalid product type',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }
}
