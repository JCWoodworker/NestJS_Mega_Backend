import { Controller, Get, Post, Body, Req } from '@nestjs/common';
import { ItemsService } from '../services/items.service';
import { CreateInventoryElementDto } from '../../dto/create-inventory-element.dto';

@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  // ITEMS
  @Get()
  async findAllItemsByUserid(@Req() request) {
    const userId = request.user.sub;
    return this.itemsService.findAllItemsByUserid(userId);
  }
  @Post()
  async createItem(@Body() body: CreateInventoryElementDto, @Req() request) {
    const userId = request.user.sub;
    return this.itemsService.create(body, userId);
  }
}
