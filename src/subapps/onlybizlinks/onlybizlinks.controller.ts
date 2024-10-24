import { Controller, Get, Param, Post, Body } from '@nestjs/common';
import { OnlyBizlinksService } from './onlybizlinks.service';

import { Auth } from 'src/iam/decorators/auth.decorator';
import { AuthType } from 'src/iam/enums/auth-type.enum';
import { CreateCustomLinkDto } from './dto/create-custom-link.dto';
import { CreateSocialLinkDto } from './dto/create-social-link.dto';
import { CreateBusinessDto } from './dto/create-business.dto';

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
}
