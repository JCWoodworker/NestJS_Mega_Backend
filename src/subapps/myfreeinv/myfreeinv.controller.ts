import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Delete,
  Param,
} from '@nestjs/common';

import { LocationsService } from './resources/services/locations.service';
import { RoomsService } from './resources/services/rooms.service';
import { ItemsService } from './resources/services/items.service';
import { FreeinvService } from './myfreeinv.service';

import { CreateInventoryElementDto } from './dto/create-inventory-element.dto';

import { Role } from 'src/users/enums/role.enum';
import { Roles } from 'src/iam/authorization/decorators/roles.decorator';

@Roles(Role.Admin, Role.Basic)
@Controller()
export class FreeinvController {
  constructor(
    private readonly itemsService: ItemsService,
    private readonly locationsService: LocationsService,
    private readonly roomsService: RoomsService,
    private readonly freeinvService: FreeinvService,
  ) {}

  // LOCATIONS
  @Get('locations')
  findAllLocationsByUserId(@Req() request) {
    const userId = request.user.sub;
    return this.locationsService.findAllLocationsByUserId(userId);
  }

  @Post('locations')
  async createLocation(
    @Body() body: CreateInventoryElementDto,
    @Req() request,
  ) {
    const userId = request.user.sub;
    return await this.locationsService.create(body, userId);
  }

  @Delete('locations/:id')
  async deleteLocation(@Param('id') locationId: number, @Req() request) {
    const userId = request.user.sub;
    return await this.locationsService.delete(locationId, userId);
  }

  // ROOMS
  @Get('rooms')
  async findAllRoomsByUserId(@Req() request) {
    const userId = request.user.sub;
    return this.roomsService.findAllRoomsByUserId(userId);
  }
  @Post('rooms')
  async createRoom(@Body() body: CreateInventoryElementDto, @Req() request) {
    const userId = request.user.sub;
    return this.roomsService.create(body, userId);
  }

  // ITEMS
  @Get('items')
  async findAllItemsByUserid(@Req() request) {
    const userId = request.user.sub;
    return this.itemsService.findAllItemsByUserid(userId);
  }
  @Post('items')
  async createItem(@Body() body: CreateInventoryElementDto, @Req() request) {
    const userId = request.user.sub;
    return this.itemsService.create(body, userId);
  }

  @Get('all-user-data')
  async getAllLocationsWithRoomsAndItems(@Req() request) {
    const userId = request.user.sub;
    return this.locationsService.getAllLocationsWithRoomsAndItems(userId);
  }

  //TEST
  @Get('testing')
  async testing() {
    return await this.freeinvService.testingMessage();
  }
}
