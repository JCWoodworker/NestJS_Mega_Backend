import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { MycuttingboardBoards } from '../../entities/mycuttingboardBoards.entity';
@Injectable()
export class BoardsService {
  constructor(
    @InjectRepository(MycuttingboardBoards)
    private boardsRepository: Repository<MycuttingboardBoards>,
  ) {}

  async getBoardDataById(id: number) {
    const board = await this.boardsRepository.findOne({ where: { id } });
    if (!board) {
      throw new HttpException('Board not found', HttpStatus.NOT_FOUND);
    }
    return board;
  }

  async addBoardData(boardData: MycuttingboardBoards) {
    return await this.boardsRepository.save(boardData);
  }

  async deleteBoardData(id: number) {
    return await this.boardsRepository.delete({ id });
  }
}
