import { Controller, Get, Req } from '@nestjs/common';

import { FreeinvService } from './myfreeinv.service';

import { Role } from 'src/users/enums/role.enum';
import { Roles } from 'src/iam/authorization/decorators/roles.decorator';

@Roles(Role.Admin, Role.Basic)
@Controller()
export class FreeinvController {
  constructor(private readonly freeinvService: FreeinvService) {}

  @Get('all-user-data')
  async getAllUserData(@Req() request) {
    const userId = request.user.sub;
    return this.freeinvService.getAllUserData(userId);
  }
}
