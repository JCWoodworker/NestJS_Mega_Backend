import { Controller, Get, Param, Post, Body } from '@nestjs/common';

import { Auth } from '@iam/decorators/auth.decorator';
import { AuthType } from '@iam/enums/auth-type.enum';

import { CreateBusinessDto } from '@onlybizlinks/dto/create-business.dto';
import { CreateCustomLinkDto } from '@onlybizlinks/dto/create-custom-link.dto';
import { CreateSocialLinkDto } from '@onlybizlinks/dto/create-social-link.dto';
import { CreateUserAndBusinessDto } from '@onlybizlinks/dto/create-user-and-business.dto';

import { OnlyBizlinksService } from './onlybizlinks.service';

@Controller('')
export class OnlyBizlinksController {
  constructor(private readonly onlyBizlinksService: OnlyBizlinksService) {}

  @Auth(AuthType.None)
  @Get(':incomingDomain')
  async findOne(@Param('incomingDomain') incomingDomain: string) {
    return this.onlyBizlinksService.findOne(incomingDomain);
  }

  @Auth(AuthType.None)
  @Get('all_businesses')
  async findAll() {
    return this.onlyBizlinksService.findAll();
  }

  @Post('add_business')
  async create(@Body() createNewBusiness: CreateBusinessDto) {
    return this.onlyBizlinksService.create(createNewBusiness);
  }

  @Post('add_custom_link')
  async createCustomLink(@Body() newCustomLink: CreateCustomLinkDto) {
    return await this.onlyBizlinksService.createCustomLink(newCustomLink);
  }

  @Post('add_social_link')
  async createSocialLink(@Body() newSocialLink: CreateSocialLinkDto) {
    return await this.onlyBizlinksService.createSocialLink(newSocialLink);
  }

  @Post('add_user_and_business')
  async createUserAndBusiness(
    @Body() newUserAndBusiness: CreateUserAndBusinessDto,
  ) {
    return await this.onlyBizlinksService.createUserAndBusiness(
      newUserAndBusiness,
    );
  }
}
