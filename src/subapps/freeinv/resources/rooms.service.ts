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
  findAll() {
    return `This action returns all rooms`;
  }

  findAllByLocationId(id: number) {
    return this.locationsRepository.find({
      where: { locationId: id },
    });
  }

  create(body: any) {
    const location = body;
    return this.locationsRepository.save(location);
  }
}
