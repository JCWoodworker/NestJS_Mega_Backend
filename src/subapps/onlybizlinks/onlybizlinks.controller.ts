import { CreateRestaurantDto } from './dto/create-business.dto';
import { Controller, Get, Param, Post, Body } from '@nestjs/common';
import { OnlyBizlinksService } from './onlybizlinks.service';

import { Auth } from 'src/iam/decorators/auth.decorator';
import { AuthType } from 'src/iam/enums/auth-type.enum';
import { CreateCustomLinkDto } from './dto/create-custom-link.dto';
import { CreateSocialLinkDto } from './dto/create-social-link.dto';

@Controller('')
export class OnlyBizlinks {
  constructor(private readonly onlyBizlinksService: OnlyBizlinksService) {}

  @Auth(AuthType.None)
  @Get(':incomingDomain')
  async findOne(@Param('incomingDomain') incomingDomain: string) {
    return this.onlyBizlinksService.findOne(incomingDomain);
  }

  @Post('add_restaurant')
  async create(@Body() createNewRestaurantDto: CreateRestaurantDto) {
    return this.onlyBizlinksService.create(createNewRestaurantDto);
  }

  @Post('add_custom_link')
  async createCustomLink(@Body() newCustomLink: CreateCustomLinkDto) {
    return await this.onlyBizlinksService.createCustomLink(newCustomLink);
  }

  @Post('add_social_link')
  async createSocialLink(@Body() newSocialLink: CreateSocialLinkDto) {
    return await this.onlyBizlinksService.createSocialLink(newSocialLink);
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
