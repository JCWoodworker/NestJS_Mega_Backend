import { Controller, Get } from '@nestjs/common';

import { LocationsService } from './resources/locations.service';
import { RoomsService } from './resources/rooms.service';
import { ItemsService } from './resources/items.service';

@Controller('freeinv')
export class FreeinvController {
  constructor(
    private readonly itemsService: ItemsService,
    private readonly locationsService: LocationsService,
    private readonly roomsService: RoomsService,
  ) {}

  @Get('locations')
  findAllLocations() {
    return 'This action returns all locations';
    // return this.locationsService.findAll();
  }

  @Get('rooms')
  findAllRooms() {
    return 'This action returns all rooms';
    // return this.roomsService.findAll();
  }

  @Get('items')
  findAllItems() {
    return 'This action returns all items';
    // return this.itemsService.findAll();
  }
}
