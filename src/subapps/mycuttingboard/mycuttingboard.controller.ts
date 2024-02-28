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
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';

@Controller('mycuttingboard')
export class MycuttingboardController {
  constructor(private readonly mycuttingboardService: MycuttingboardService) {}

  @Post()
  create(@Body() createBoardDto: CreateBoardDto) {
    return this.mycuttingboardService.create(createBoardDto);
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
  update(@Param('id') id: string, @Body() updateBoardDto: UpdateBoardDto) {
    return this.mycuttingboardService.update(+id, updateBoardDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.mycuttingboardService.remove(+id);
  }
}
