import { Controller, Get, Param, Body, Post, Delete } from '@nestjs/common';
import { CoastersService } from '../services/coasters.service';
import { Auth } from 'src/iam/decorators/auth.decorator';
import { AuthType } from 'src/iam/enums/auth-type.enum';
import { Role } from 'src/users/enums/role.enum';
import { Roles } from 'src/iam/authorization/decorators/roles.decorator';

@Controller('coasters')
export class CoastersController {
  constructor(private readonly coastersService: CoastersService) {}

  @Auth(AuthType.None)
  @Get(':id')
  async getTestMessage(@Param('id') id: number) {
    return await this.coastersService.getCoasterDataById(id);
  }

  @Roles(Role.Admin)
  @Post()
  async addCoasterData(@Body() coasterData) {
    return await this.coastersService.addCoasterData(coasterData);
  }

  @Roles(Role.Admin)
  @Delete(':id')
  async deleteCoasterData(@Param('id') id: number) {
    return await this.coastersService.deleteCoasterData(id);
  }
}
