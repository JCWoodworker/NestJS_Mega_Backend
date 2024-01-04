import { Injectable } from '@nestjs/common';
import { CreateFreeinvDto } from './dto/create-freeinv.dto';
import { UpdateFreeinvDto } from './dto/update-freeinv.dto';

@Injectable()
export class FreeinvService {
  create(createFreeinvDto: CreateFreeinvDto) {
    return 'This action adds a new freeinv';
  }

  findAll() {
    return `This action returns all freeinv`;
  }

  findOne(id: number) {
    return `This action returns a #${id} freeinv`;
  }

  update(id: number, updateFreeinvDto: UpdateFreeinvDto) {
    return `This action updates a #${id} freeinv`;
  }

  remove(id: number) {
    return `This action removes a #${id} freeinv`;
  }
}
