import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Items } from '../entities/item.entity';
import { CreateInventoryElementDto } from '../dto/create-inventory-element.dto';
import { UpdateInventoryElementDto } from '../dto/update-inventory-element.dto';

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

  async create(body: CreateInventoryElementDto, userId: string) {
    const item = { ...body, userId };
    return await this.itemsRepository.save(item);
  }

  async update(id: number, body: UpdateInventoryElementDto) {
    return this.itemsRepository.update(id, body);
  }
}
