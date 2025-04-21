import {
  Controller,
  Get,
  // Post,
  // Body,
  // Patch,
  Param,
  // Delete,
} from '@nestjs/common';
import { UUID } from 'crypto';

import { Auth } from '@iam/decorators/auth.decorator';
import { AuthType } from '@iam/enums/auth-type.enum';

import { IronviewService } from './ironview.service';

@Auth(AuthType.None)
@Controller('')
export class IronviewController {
  constructor(private readonly ironviewService: IronviewService) {}

  @Get('buildings')
  findAll() {
    return this.ironviewService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: UUID) {
    return this.ironviewService.findOne(id);
  }

  // @Post()
  // create(@Body() createIronview) {
  //   return this.ironviewService.create(createIronview);
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
