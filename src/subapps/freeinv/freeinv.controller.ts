import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { FreeinvService } from './freeinv.service';
import { CreateFreeinvDto } from './dto/create-freeinv.dto';
import { UpdateFreeinvDto } from './dto/update-freeinv.dto';

@Controller('freeinv')
export class FreeinvController {
  constructor(private readonly freeinvService: FreeinvService) {}

  @Post()
  create(@Body() createFreeinvDto: CreateFreeinvDto) {
    return this.freeinvService.create(createFreeinvDto);
  }

  @Get()
  findAll() {
    return this.freeinvService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.freeinvService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateFreeinvDto: UpdateFreeinvDto) {
    return this.freeinvService.update(+id, updateFreeinvDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.freeinvService.remove(+id);
  }
}
