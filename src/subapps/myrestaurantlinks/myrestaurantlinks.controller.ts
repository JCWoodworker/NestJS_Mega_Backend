import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { Controller, Get, Param, Post, Body } from '@nestjs/common';
import { MyrestaurantlinksService } from './myrestaurantlinks.service';
// import { UpdateMyrestaurantlinkDto } from './dto/update-myrestaurantlink.dto';

import { Auth } from 'src/iam/decorators/auth.decorator';
import { AuthType } from 'src/iam/enums/auth-type.enum';

@Controller('')
export class MyrestaurantlinksController {
  constructor(
    private readonly myrestaurantlinksService: MyrestaurantlinksService,
  ) {}

  @Auth(AuthType.None)
  @Get(':incomingDomain')
  async findOne(@Param('incomingDomain') incomingDomain: string) {
    return this.myrestaurantlinksService.findOne(incomingDomain);
  }

  @Auth(AuthType.None)
  @Post()
  async create(@Body() createNewRestaurantDto: CreateRestaurantDto) {
    return this.myrestaurantlinksService.create(createNewRestaurantDto);
  }

  // @Patch(':id')
  // update(
  //   @Param('id') id: string,
  //   @Body() updateMyrestaurantlinkDto: UpdateMyrestaurantlinkDto,
  // ) {
  //   return this.myrestaurantlinksService.update(+id, updateMyrestaurantlinkDto);
  // }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.myrestaurantlinksService.remove(+id);
  // }
}
