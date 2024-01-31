import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';

import { LocationsService } from './resources/locations.service';
import { RoomsService } from './resources/rooms.service';
import { ItemsService } from './resources/items.service';

import { Role } from 'src/users/enums/role.enum';
import { Roles } from 'src/iam/authorization/decorators/roles.decorator';
import { FileInterceptor } from '@nestjs/platform-express';

@Roles(Role.Admin, Role.Basic)
@Controller('freeinv')
export class FreeinvController {
  constructor(
    private readonly itemsService: ItemsService,
    private readonly locationsService: LocationsService,
    private readonly roomsService: RoomsService,
  ) {}

  // LOCATIONS
  @Get('locations')
  findAllLocationsByUserId(@Req() request) {
    const userId = request.user.sub;
    return this.locationsService.findAllLocationsByUserId(userId);
  }

  @Post('locations')
  createLocation(@Body() body: any, @Req() request) {
    const userId = request.user.sub;
    return this.locationsService.create(body, userId);
  }

  // ROOMS
  @Get('rooms')
  async findAllRoomsByUserId(@Req() request) {
    const userId = request.user.sub;
    return this.roomsService.findAllRoomsByUserId(userId);
  }
  @Post('rooms')
  async createRoom(@Body() body: any, @Req() request) {
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
  async createItem(@Body() body: any, @Req() request) {
    const userId = request.user.sub;
    return this.itemsService.create(body, userId);
  }

  // ALL USER DATA
  @Get('complete-location')
  async getAllLocationsWithRoomsAndItems(@Req() request) {
    const userId = request.user.sub;
    return this.locationsService.getAllLocationsWithRoomsAndItems(userId);
  }

  // S3 BUCKET UPLOAD
  @Post('image-upload')
  @UseInterceptors(FileInterceptor('image'))
  async imageUpload(@UploadedFile() file: Express.Multer.File) {
    return await this.itemsService.imageUpload(file);
  }
}
