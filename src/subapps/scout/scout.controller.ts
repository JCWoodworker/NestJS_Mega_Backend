import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { ScoutService } from './scout.service';
import { CreateScoutDto } from './dto/create-scout.dto';
import { UpdateScoutDto } from './dto/update-scout.dto';

@Controller('scout')
export class ScoutController {
  constructor(private readonly scoutService: ScoutService) {}

  @Post()
  create(@Body() createScoutDto: CreateScoutDto) {
    return this.scoutService.create(createScoutDto);
  }

  @Get()
  findAll() {
    return 'what up!!';
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.scoutService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateScoutDto: UpdateScoutDto) {
    return this.scoutService.update(+id, updateScoutDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.scoutService.remove(+id);
  }
}
