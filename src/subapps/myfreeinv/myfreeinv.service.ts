import { Injectable } from '@nestjs/common';

import { ItemsService } from './resources/services/items.service';
import { RoomsService } from './resources/services/rooms.service';
import { LocationsService } from './resources/services/locations.service';

@Injectable()
export class FreeinvService {
  constructor(
    private readonly itemsService: ItemsService,
    private readonly locationsService: LocationsService,
    private readonly roomsService: RoomsService,
  ) {}

  async getAllUserData(userId: string) {
    const completeData =
      await this.locationsService.getAllLocationsWithRoomsAndItems(userId);
    const locationsList =
      await this.locationsService.findAllLocationsByUserId(userId);
    const roomsList = await this.roomsService.findAllRoomsByUserId(userId);
    const itemsList = await this.itemsService.findAllItemsByUserid(userId);
    return { completeData, locationsList, roomsList, itemsList };
  }
}
