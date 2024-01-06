import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Locations } from '../entities/location.entity';

@Injectable()
export class LocationsService {
  constructor(
    @InjectRepository(Locations)
    private readonly locationsRepository: Repository<Locations>,
  ) {}
  async findAllLocationsByUserId(userId: string) {
    const locationList = this.locationsRepository.find({ where: { userId } });
    return locationList;
  }

  async getAllLocationsWithRoomsAndItems(userId: string) {
    return await this.locationsRepository.find({
      relations: ['rooms.items'],
      where: { userId: userId },
    });
  }

  async create(body: any, userId: string) {
    const location = { ...body, userId };
    return this.locationsRepository.save(location);
  }
}
