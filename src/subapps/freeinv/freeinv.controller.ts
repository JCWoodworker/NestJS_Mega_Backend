import { Controller, Get, Post, Body, Req } from '@nestjs/common';

import { LocationsService } from './resources/locations.service';
import { RoomsService } from './resources/rooms.service';
import { ItemsService } from './resources/items.service';

// import { Auth } from 'src/iam/decorators/auth.decorator';
// import { AuthType } from 'src/iam/enums/auth-type.enum';
import { Role } from 'src/users/enums/role.enum';
import { Roles } from 'src/iam/authorization/decorators/roles.decorator';

@Roles(Role.Admin)
@Controller('freeinv')
export class FreeinvController {
  constructor(
    private readonly itemsService: ItemsService,
    private readonly locationsService: LocationsService,
    private readonly roomsService: RoomsService,
  ) {}

  // TODO: add validator function that checks the request's userId against the userId of the location being edited

  @Get('locations')
  findAllLocations() {
    return this.locationsService.findAll();
  }
  @Post('locations')
  createLocation(@Body() body: any, @Req() request) {
    const userId = request.user.sub;
    return this.locationsService.create(body, userId);
  }
  @Get('rooms')
  findAllRooms() {
    return this.roomsService.findAll();
  }
  @Post('rooms')
  createRoom(@Body() body: any) {
    return this.roomsService.create(body);
  }
  @Get('items')
  findAllItems() {
    return this.itemsService.findAll();
  }
  @Post('items')
  createItem(@Body() body: any) {
    return this.itemsService.create(body);
  }

  @Roles(Role.Admin, Role.Basic)
  @Get('complete-location')
  getAllLocationsWithRoomsAndItems(@Req() request) {
    debugger;
    const userId = request.user.sub;
    return this.locationsService.getAllLocationsWithRoomsAndItems(userId);
  }
}
