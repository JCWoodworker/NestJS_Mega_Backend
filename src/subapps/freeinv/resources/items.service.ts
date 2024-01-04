import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Items } from '../entities/item.entity';

@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(Items)
    private readonly itemsRepository: Repository<Items>,
  ) {}
  findAll() {
    return `This action returns all items`;
  }
  create(body: any) {
    const location = body;
    return this.itemsRepository.save(location);
  }
}
