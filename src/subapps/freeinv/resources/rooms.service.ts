import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rooms } from '../entities/room.entity';

@Injectable()
export class RoomsService {
  constructor(
    @InjectRepository(Rooms)
    private readonly locationsRepository: Repository<Rooms>,
  ) {}

  async findAllRoomsByUserId(userId: string) {
    return this.locationsRepository.find({
      where: { userId: userId },
    });
  }

  async findAllRoomsByLocationId(id: number) {
    return this.locationsRepository.find({
      where: { locationId: id },
    });
  }

  async create(body: any, userId: string) {
    const room = { ...body, userId };
    return this.locationsRepository.save(room);
  }
}
