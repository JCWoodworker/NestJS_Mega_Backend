/*
There needs to be a freeinv service that handles business logic from multiple services.
We should not cross-use methods between loactions, rooms, and items services.

This is not a good practice regarding single responsibility
*/

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { MyfreeinvLocations } from '../../entities/location.entity';
import { MyfreeinvRooms } from '../../entities/room.entity';
import { MyfreeinvItems } from '../../entities/item.entity';
import { CreateInventoryElementDto } from '../../dto/create-inventory-element.dto';
import { UpdateInventoryElementDto } from '../../dto/update-inventory-element.dto';

@Injectable()
export class LocationsService {
  constructor(
    @InjectRepository(MyfreeinvLocations)
    private readonly locationsRepository: Repository<MyfreeinvLocations>,
    @InjectRepository(MyfreeinvRooms)
    private readonly roomsRepository: Repository<MyfreeinvRooms>,
    @InjectRepository(MyfreeinvItems)
    private readonly itemsRepository: Repository<MyfreeinvItems>,
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
    const roomIds = locationForDeletion.rooms?.map((room) => room.id);
    const itemIds = locationForDeletion.rooms?.flatMap(
      (room) => room.items?.map((item) => item.id),
    );

    if (!locationForDeletion) {
      return { result: false, message: 'Location not found' };
    }

    if (locationForDeletion.userId !== userId) {
      //  We will need more logic here in the future to account for an admin making changes on behalf of a user
      return {
        result: false,
        message:
          'User attempting to make the change does not own this location and is not an admin',
      };
    }

    if (itemIds.length > 0 && locationForDeletion.orphan_location === true) {
      return {
        result: false,
        message: 'Cannot delete location with orphaned items',
      };
    }

    if (itemIds.length === 0) {
      try {
        await this.locationsRepository.delete(locationId);
        return { result: true, message: 'Location deleted, no orphaned items' };
      } catch (error) {
        return { result: false, message: 'Error deleting location' };
      }
    }

    const orphanRoom = await this.findOrAddOrphanLocation(userId);
    await this.itemsRepository
      .createQueryBuilder()
      .update(MyfreeinvItems)
      .set({ roomId: +orphanRoom.id })
      .where('myfreeinv_items."roomId" IN (:...roomIds)', { roomIds })
      .execute();
    try {
      await this.locationsRepository.delete(locationId);
      return {
        result: true,
        message: `Location deleted, ${itemIds.length} orphaned items moved to new orphan location`,
        orphanRoom,
      };
    } catch (error) {
      return { result: false, message: 'Error deleting location' };
    }
  }

  async findOrAddOrphanLocation(userId: string) {
    const currentOrphanLocation = await this.locationsRepository.findOne({
      relations: ['rooms'],
      where: { userId, orphan_location: true },
    });
    if (currentOrphanLocation) {
      const currentOrphanRoom = currentOrphanLocation.rooms[0];
      return currentOrphanRoom;
    }
    const newOrphanLocation = await this.locationsRepository.save({
      userId,
      name: 'Orphaned Items Home',
      orphan_location: true,
    });
    const newOrphanRoom = await this.roomsRepository.save({
      userId,
      name: 'Orphaned Items Room',
      orphan_room: true,
      locationId: newOrphanLocation.id,
    });
    return newOrphanRoom;
  }
}
