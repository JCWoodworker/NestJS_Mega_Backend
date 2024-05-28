import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { MycuttingboardBoards } from '../../entities/mycuttingboardBoards.entity';
import { MycuttingboardCoasters } from '../../entities/mycuttingboardCoasters.entity';
import { MycuttingboardWoods } from '../../entities/mycuttingboardWoods.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(MycuttingboardBoards)
    private boardsRepository: Repository<MycuttingboardBoards>,
    @InjectRepository(MycuttingboardCoasters)
    private coastersRepository: Repository<MycuttingboardCoasters>,
    @InjectRepository(MycuttingboardWoods)
    private woodsRepository: Repository<MycuttingboardWoods>,
  ) {}

  async getTestMessage() {
    return {
      message: 'This message will only show to users with admin access',
    };
  }

  // async getBoardDataById(id: number) {
  //   const board = await this.boardsRepository.findOne({ where: { id } });
  //   if (!board) {
  //     throw new HttpException('Board not found', HttpStatus.NOT_FOUND);
  //   }
  //   return board;
  // }

  // async addBoardData(boardData: MycuttingboardBoards) {
  //   return await this.boardsRepository.save(boardData);
  // }

  // async deleteBoardData(id: number) {
  //   return await this.boardsRepository.delete({ id });
  // }
}
