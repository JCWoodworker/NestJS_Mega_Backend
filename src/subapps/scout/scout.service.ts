import { Injectable } from '@nestjs/common';
import { CreateScoutDto } from './dto/create-scout.dto';
import { UpdateScoutDto } from './dto/update-scout.dto';

@Injectable()
export class ScoutService {
  create(createScoutDto: CreateScoutDto) {
    return 'This action adds a new scout';
  }

  findAll() {
    return `This action returns all scout`;
  }

  findOne(id: number) {
    return `This action returns a #${id} scout`;
  }

  update(id: number, updateScoutDto: UpdateScoutDto) {
    return `This action updates a #${id} scout`;
  }

  remove(id: number) {
    return `This action removes a #${id} scout`;
  }
}
