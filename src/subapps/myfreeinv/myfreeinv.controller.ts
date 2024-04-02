import { Controller, Get, Req } from '@nestjs/common';

import { FreeinvService } from './myfreeinv.service';

@Controller()
export class FreeinvController {
  constructor(private readonly freeinvService: FreeinvService) {}

  @Get('all-user-data')
  async getAllUserData(@Req() request) {
    const userId = request.user.sub;
    return this.freeinvService.getAllUserData(userId);
  }
}
