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
  async findAllItemsByUserid(userId: string) {
    return this.itemsRepository.find({ where: { userId: userId } });
  }

  async findAllByItemId(id: number) {
    return this.itemsRepository.find({
      where: { roomId: id },
    });
  }

  async create(body: any, userId: string) {
    const item = { ...body, userId };
    return await this.itemsRepository.save(item);
  }

  // imageUpload() NEEDS to be extracted into it's own controller and service!!
  // This should probably even be moved out of subapps/freeinv and be able to be used
  // across all subapps.
}