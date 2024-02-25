import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rooms } from '../entities/room.entity';
import { CreateInventoryElementDto } from '../dto/create-inventory-element.dto';
import { UpdateInventoryElementDto } from '../dto/update-inventory-element.dto';

@Injectable()
export class RoomsService {
  constructor(
    @InjectRepository(Rooms)
    private readonly roomsRepository: Repository<Rooms>,
  ) {}

  async findAllRoomsByUserId(userId: string) {
    return this.roomsRepository.find({
      where: { userId: userId },
    });
  }

  async findAllRoomsByLocationId(id: number) {
    return this.roomsRepository.find({
      where: { locationId: id },
    });
  }

  async create(body: CreateInventoryElementDto, userId: string) {
    const room = { ...body, userId };
    return this.roomsRepository.save(room);
  }

  async update(id: number, body: UpdateInventoryElementDto) {
    return this.roomsRepository.update(id, body);
  }
}
