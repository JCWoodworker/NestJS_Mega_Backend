import {
  Controller,
  // Get,
  // Post,
  // Body,
  // Patch,
  // Param,
  // Delete,
} from '@nestjs/common';

import { IronviewService } from './ironview.service';

@Controller('ironview')
export class IronviewController {
  constructor(private readonly ironviewService: IronviewService) {}

  // @Post()
  // create(@Body() createIronview) {
  //   return this.ironviewService.create(createIronview);
  // }

  // @Get()
  // findAll() {
  //   return this.ironviewService.findAll();
  // }

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.ironviewService.findOne(+id);
  // }

  // @Patch(':id')
  // update(@Param('id') id: string, @Body() updateIronview) {
  //   return this.ironviewService.update(+id, updateIronview);
  // }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.ironviewService.remove(+id);
  // }
}
