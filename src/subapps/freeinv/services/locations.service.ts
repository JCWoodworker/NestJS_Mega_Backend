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
import { Rooms } from '../entities/room.entity';
import { Items } from '../entities/item.entity';
import { CreateInventoryElementDto } from '../dto/create-inventory-element.dto';
import { UpdateInventoryElementDto } from '../dto/update-inventory-element.dto';

import { ItemsService } from './items.service';

@Injectable()
export class LocationsService {
  constructor(
    @InjectRepository(Locations)
    private readonly locationsRepository: Repository<Locations>,
    @InjectRepository(Rooms)
    private readonly roomsRepository: Repository<Rooms>,
    @InjectRepository(Items)
    private readonly itemsRepository: Repository<Items>,
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
    const roomIds = locationForDeletion.rooms.map((room) => room.id);

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
    const allItemsFromLocation =
      await this.itemsService.findAllItemsByLocationId(locationId);
    if (allItemsFromLocation.length === 0) {
      return await this.locationsRepository.delete(locationId);
    }
    const orphanRoomId = await this.findOrAddOrphanLocation(userId);
    await this.itemsRepository
      .createQueryBuilder()
      .update(Items)
      .set({ roomId: +orphanRoomId })
      .where('items."roomId" IN (:...roomIds)', { roomIds })
      .execute();

    return await this.locationsRepository.delete(locationId);
  }

  async findOrAddOrphanLocation(userId: string) {
    const currentOrphanLocation = await this.locationsRepository.findOne({
      relations: ['rooms'],
      where: { userId, orphan_location: true },
    });
    if (currentOrphanLocation) {
      const currentOrphanRoomId = currentOrphanLocation.rooms[0].id;
      return currentOrphanRoomId;
    }
    const newOrphanLocation = await this.locationsRepository.save({
      userId,
      name: 'Orphan Home',
      orphan_location: true,
    });
    const newOrphanRoom = await this.roomsRepository.save({
      userId,
      name: 'Orphan Room',
      orphan_room: true,
      locationId: newOrphanLocation.id,
    });
    return newOrphanRoom.id;
  }
}
