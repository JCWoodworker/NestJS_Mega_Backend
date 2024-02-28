import { Injectable } from '@nestjs/common';
import { CreateMycuttingboardDto } from './dto/create-mycuttingboard.dto';
import { UpdateMycuttingboardDto } from './dto/update-mycuttingboard.dto';

@Injectable()
export class MycuttingboardService {
  create(createMycuttingboardDto: CreateMycuttingboardDto) {
    return 'This action adds a new mycuttingboard';
  }

  findAll() {
    return `This action returns all mycuttingboard`;
  }

  findOne(id: number) {
    return `This action returns a #${id} mycuttingboard`;
  }

  update(id: number, updateMycuttingboardDto: UpdateMycuttingboardDto) {
    return `This action updates a #${id} mycuttingboard`;
  }

  remove(id: number) {
    return `This action removes a #${id} mycuttingboard`;
  }
}
