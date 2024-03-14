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

  /*
  TODO: refactor to send these lists without having to query each repository.

    All the necessary data is in getAllLocationsWithRoomsAndItems() and we just
    need to parse it all out into lists with the data we prefer

    Locations - id, name, description, room quantity, item quantity
    Rooms - id, name, description, location name, number of items
    Items - id, name, description, room name, location name

    We can return the same object with the added key/value pairs.
    This should mean only minimal changes on the frontend will be needed
      - Mostly just changing interfaces/types since all functions will still work
  */

  async getAllUserData(userId: string) {
    return await this.locationsService.getAllLocationsWithRoomsAndItems(userId);
    // const locationsList =
    //   await this.locationsService.findAllLocationsByUserId(userId);
    // const roomsList = await this.roomsService.findAllRoomsByUserId(userId);
    // const itemsList = await this.itemsService.findAllItemsByUserid(userId);
  }
}
