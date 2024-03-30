import { Controller, Get, Post, Body, Req } from '@nestjs/common';
import { RoomsService } from '../services/rooms.service';
import { CreateInventoryElementDto } from '../../dto/create-inventory-element.dto';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  async findAllRoomsByUserId(@Req() request) {
    const userId = request.user.sub;
    return this.roomsService.findAllRoomsByUserId(userId);
  }
  @Post()
  async createRoom(@Body() body: CreateInventoryElementDto, @Req() request) {
    const userId = request.user.sub;
    return this.roomsService.create(body, userId);
  }
}
