import { Injectable } from '@nestjs/common';
import { CreateRilwDto } from './dto/create-rilw.dto';
import { UpdateRilwDto } from './dto/update-rilw.dto';

@Injectable()
export class RilwService {
  create(createRilwDto: CreateRilwDto) {
    return 'This action adds a new rilw';
  }

  findAll() {
    return `This action returns all rilw`;
  }

  findOne(id: number) {
    return `This action returns a #${id} rilw`;
  }

  update(id: number, updateRilwDto: UpdateRilwDto) {
    return `This action updates a #${id} rilw`;
  }

  remove(id: number) {
    return `This action removes a #${id} rilw`;
  }
}
