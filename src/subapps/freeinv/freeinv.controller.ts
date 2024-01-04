import { Controller, Get } from '@nestjs/common';

import { LocationsService } from './resources/locations.service';
import { RoomsService } from './resources/rooms.service';
import { ItemsService } from './resources/items.service';

import { Auth } from 'src/iam/decorators/auth.decorator';
import { AuthType } from 'src/iam/enums/auth-type.enum';

@Auth(AuthType.None)
@Controller('freeinv')
export class FreeinvController {
  constructor(
    private readonly itemsService: ItemsService,
    private readonly locationsService: LocationsService,
    private readonly roomsService: RoomsService,
  ) {}

  @Get('locations')
  findAllLocations() {
    return this.locationsService.findAll();
  }

  @Get('rooms')
  findAllRooms() {
    return this.roomsService.findAll();
  }

  @Get('items')
  findAllItems() {
    return this.itemsService.findAll();
  }
}
