import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { RilwService } from './rilw.service';
import { CreateRilwDto } from './dto/create-rilw.dto';
import { UpdateRilwDto } from './dto/update-rilw.dto';
import { Auth } from '@iam/decorators/auth.decorator';
import { AuthType } from '@iam/enums/auth-type.enum';

@Auth(AuthType.None)
@Controller('')
export class RilwController {
  constructor(private readonly rilwService: RilwService) {}

  @Get('portfolio/woodworking')
  woodworkingPortfolio() {
    return this.rilwService.listWoodworkingPortfolio();
  }

  @Post()
  create(@Body() createRilwDto: CreateRilwDto) {
    return this.rilwService.create(createRilwDto);
  }

  @Get()
  findAll() {
    return this.rilwService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rilwService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateRilwDto: UpdateRilwDto) {
    return this.rilwService.update(+id, updateRilwDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.rilwService.remove(+id);
  }
}
