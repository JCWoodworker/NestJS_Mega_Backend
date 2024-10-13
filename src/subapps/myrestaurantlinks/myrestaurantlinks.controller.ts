import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { Controller, Get, Param, Post, Body } from '@nestjs/common';
import { MyrestaurantlinksService } from './myrestaurantlinks.service';

import { Auth } from 'src/iam/decorators/auth.decorator';
import { AuthType } from 'src/iam/enums/auth-type.enum';
import { CreateCustomLinkDto } from './dto/create-custom-link.dto';
import { CreateSocialLinkDto } from './dto/create-social-link.dto';

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
  @Post('add_restaurant')
  async create(@Body() createNewRestaurantDto: CreateRestaurantDto) {
    return this.myrestaurantlinksService.create(createNewRestaurantDto);
  }

  // TODO: THIS WILL REQUIRE AUTH!!  DO NOT FORGET!!
  @Auth(AuthType.None)
  @Post('add_custom_link')
  async createCustomLink(@Body() newCustomLink: CreateCustomLinkDto) {
    return await this.myrestaurantlinksService.createCustomLink(newCustomLink);
  }

  // TODO: THIS WILL REQUIRE AUTH!!  DO NOT FORGET!!
  @Auth(AuthType.None)
  @Post('add_social_link')
  async createSocialLink(@Body() newSocialLink: CreateSocialLinkDto) {
    return await this.myrestaurantlinksService.createSocialLink(newSocialLink);
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
