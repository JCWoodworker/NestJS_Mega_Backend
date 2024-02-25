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

  async findLocationById(locationId: number) {
    return this.locationsRepository.findOne({
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
    return this.locationsRepository.save(location);
  }

  async update(id: number, body: UpdateInventoryElementDto) {
    return this.locationsRepository.update(id, body);
  }

  async delete(locationId: number, userId: string) {
    debugger;
    try {
      const locationForDeletion = await this.findLocationById(locationId);
    } catch (error) {
      debugger
      throw error.message;
    }
    debugger;
    /*
      If no location, return error
    Compare userId to locationForDeletion.userId
      If location is not owned by user, return error
    If locationForDeletion.rooms.length === 0
      delete location
    If locationForDeletion.rooms.length > 0
      for each room, check if room.items.length === 0
      if ALL rooms have no items
        delete all rooms
        delete location
      else const allItemsFromLocation = for each room, get all items
      
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

    return {
      message: `Location ${locationId} for user ${userId} would have been deleted, but this is not implemented`,
    };
  }
}
