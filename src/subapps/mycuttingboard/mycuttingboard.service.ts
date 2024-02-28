import { Injectable } from '@nestjs/common';
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';

@Injectable()
export class MycuttingboardService {
  create(createBoardDto: CreateBoardDto) {
    return 'This action adds a new mycuttingboard';
  }

  findAll() {
    return `This action returns all mycuttingboard`;
  }

  findOne(id: number) {
    return `This action returns a #${id} mycuttingboard`;
  }

  update(id: number, updateBoardDto: UpdateBoardDto) {
    return `This action updates a #${id} mycuttingboard`;
  }

  remove(id: number) {
    return `This action removes a #${id} mycuttingboard`;
  }
}
