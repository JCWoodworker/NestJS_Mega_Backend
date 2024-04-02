import { Controller, Get, Param, Body, Post, Delete } from '@nestjs/common';
import { BoardsService } from '../services/boards.service';
import { Auth } from 'src/iam/decorators/auth.decorator';
import { AuthType } from 'src/iam/enums/auth-type.enum';
import { Role } from 'src/users/enums/role.enum';
import { Roles } from 'src/iam/authorization/decorators/roles.decorator';

@Controller('boards')
export class BoardsController {
  constructor(private readonly boardsService: BoardsService) {}

  @Auth(AuthType.None)
  @Get(':id')
  async getTestMessage(@Param('id') id: number) {
    return await this.boardsService.getBoardDataById(id);
  }

  @Roles(Role.Admin)
  @Post()
  async addBoardData(@Body() boardData) {
    return await this.boardsService.addBoardData(boardData);
  }

  @Roles(Role.Admin)
  @Delete(':id')
  async deleteBoardData(@Param('id') id: number) {
    return await this.boardsService.deleteBoardData(id);
  }
}
