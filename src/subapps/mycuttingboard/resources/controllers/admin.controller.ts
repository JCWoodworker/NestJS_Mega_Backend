import { Controller, Get, Param, Post, Body, Delete } from '@nestjs/common';
import { AdminService } from '../services/admin.service';
import { Roles } from 'src/iam/authorization/decorators/roles.decorator';
import { Role } from 'src/users/enums/role.enum';

import { MycuttingboardBoards } from '../../entities/mycuttingboardBoards.entity';
import { MycuttingboardCoasters } from '../../entities/mycuttingboardCoasters.entity';

@Roles(Role.Admin)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('test-message')
  async getTestMessage() {
    return await this.adminService.getTestMessage();
  }

  @Get('board/:id')
  async getBoardDataById(@Param('id') id: number) {
    return await this.adminService.getBoardDataById(id);
  }

  @Post('board')
  async addBoardData(@Body() boardData: MycuttingboardBoards) {
    return await this.adminService.addBoardData(boardData);
  }

  @Delete('board/:id')
  async deleteBoardData(@Param('id') id: number) {
    return await this.adminService.deleteBoardData(id);
  }

  @Get('coaster/:id')
  async getCoasterDataById(@Param('id') id: number) {
    return await this.adminService.getCoasterDataById(id);
  }

  @Post('coaster')
  async addCoasterData(@Body() coasterData: MycuttingboardCoasters) {
    return await this.adminService.addCoasterData(coasterData);
  }

  @Delete('coaster/:id')
  async deleteCoasterData(@Param('id') id: number) {
    return await this.adminService.deleteCoasterData(id);
  }
}
