import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MycuttingboardWoods } from '../../entities/mycuttingboardWoods.entity';

@Injectable()
export class WoodsService {
  constructor(
    @InjectRepository(MycuttingboardWoods)
    private readonly mycuttingboardWoodsRepository: Repository<MycuttingboardWoods>,
  ) {}

  async getMessage() {
    return 'Hello from woods service!';
  }
}
