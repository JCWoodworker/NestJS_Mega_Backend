/*

We NEED to eventually set up all the logic that allows for cascading deletions of rooms
when a location is deleted, BUT we must remove the room id from the item entity without
deleting the item itself.

The goal is to make sure no Items are deleted unless the user manually deletes them,
and they can just live in limbo without a room id until a one is appointed.

UPDATE logic is next on the TODO list for these services.

*/

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
