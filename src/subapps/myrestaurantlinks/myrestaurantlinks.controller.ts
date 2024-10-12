import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { MyrestaurantlinksService } from './myrestaurantlinks.service';
import { CreateMyrestaurantlinkDto } from './dto/create-myrestaurantlink.dto';
import { UpdateMyrestaurantlinkDto } from './dto/update-myrestaurantlink.dto';

@Controller('myrestaurantlinks')
export class MyrestaurantlinksController {
  constructor(private readonly myrestaurantlinksService: MyrestaurantlinksService) {}

  @Post()
  create(@Body() createMyrestaurantlinkDto: CreateMyrestaurantlinkDto) {
    return this.myrestaurantlinksService.create(createMyrestaurantlinkDto);
  }

  @Get()
  findAll() {
    return this.myrestaurantlinksService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.myrestaurantlinksService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateMyrestaurantlinkDto: UpdateMyrestaurantlinkDto) {
    return this.myrestaurantlinksService.update(+id, updateMyrestaurantlinkDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.myrestaurantlinksService.remove(+id);
  }
}
