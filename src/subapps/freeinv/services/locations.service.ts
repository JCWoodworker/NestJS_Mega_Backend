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
import { UpdateInventoryElementDto } from '../dto/update-inventory-element.dto';

import { ItemsService } from './items.service';

@Injectable()
export class LocationsService {
  constructor(
    @InjectRepository(Locations)
    private readonly locationsRepository: Repository<Locations>,
    private readonly itemsService: ItemsService,
  ) {}
  async findAllLocationsByUserId(userId: string) {
    const locationList = this.locationsRepository.find({ where: { userId } });
    return locationList;
  }

  async findLocationById(locationId: number) {
    return this.locationsRepository.findOne({
      relations: ['rooms', 'rooms.items'],
      where: { id: locationId },
    });
  }

  async getAllLocationsWithRoomsAndItems(userId: string) {
    return await this.locationsRepository.find({
      relations: ['rooms.items'],
      where: { userId },
    });
  }

  async create(body: CreateInventoryElementDto, userId: string) {
    const location = { ...body, userId };
    return await this.locationsRepository.save(location);
  }

  async update(id: number, body: UpdateInventoryElementDto) {
    return this.locationsRepository.update(id, body);
  }

  async delete(locationId: number, userId: string) {
    const locationForDeletion = await this.findLocationById(locationId);

    if (!locationForDeletion) {
      return { message: 'Location not found' };
    }

    if (locationForDeletion.userId !== userId) {
      //  We will need more logic here in the future to account for an admin making changes on behalf of a user
      return {
        message:
          'User attempting to make the change does not own this location and is not an admin',
      };
    }

    if (locationForDeletion.rooms.length === 0) {
      return await this.locationsRepository.delete(locationId);
    }

    const allItemsFromLocation =
      await this.itemsService.findAllItemsByLocationId(locationId);
    debugger;
    if (allItemsFromLocation.length === 0) {
      return await this.locationsRepository.delete(locationId);
    }
    return false;

    /*
      
    Check if user has a location and a room with the orphan_room boolean set to true
      If true
        save the orphanLocationId and orphanRoomId
      If false
        const newOrphanLocation = create a new location with the orphan_room boolean set to true
        const newOrphanRoom = create a new room using newOrphanLocation.id, and with the orphan_room boolean set to true

    Change roomId for all items in allItemsFromLocation to orphanRoomId or newOrphanRoom.id

    delete all rooms with locationForDeletion.id
    delete locationForDeletion

    return message: "Location deleted and orphaned items moved to new orphan location and room"

    */
  }
}
