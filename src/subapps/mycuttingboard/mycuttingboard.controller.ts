import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { MycuttingboardService } from './mycuttingboard.service';
import { CreateMycuttingboardDto } from './dto/create-mycuttingboard.dto';
import { UpdateMycuttingboardDto } from './dto/update-mycuttingboard.dto';

@Controller('mycuttingboard')
export class MycuttingboardController {
  constructor(private readonly mycuttingboardService: MycuttingboardService) {}

  @Post()
  create(@Body() createMycuttingboardDto: CreateMycuttingboardDto) {
    return this.mycuttingboardService.create(createMycuttingboardDto);
  }

  @Get()
  findAll() {
    return this.mycuttingboardService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.mycuttingboardService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateMycuttingboardDto: UpdateMycuttingboardDto,
  ) {
    return this.mycuttingboardService.update(+id, updateMycuttingboardDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.mycuttingboardService.remove(+id);
  }
}
