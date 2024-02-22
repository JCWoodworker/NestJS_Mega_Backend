import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Locations } from '../entities/location.entity';
import { CreateInventoryElementDto } from '../dto/create-inventory-element.dto';

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
      where: { userId },
    });
  }

  async create(body: CreateInventoryElementDto, userId: string) {
    const location = { ...body, userId };
    return this.locationsRepository.save(location);
  }
}
