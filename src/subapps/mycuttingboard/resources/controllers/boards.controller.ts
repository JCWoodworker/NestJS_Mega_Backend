import { Controller, Get, Param } from '@nestjs/common';
import { BoardsService } from '../services/boards.service';
import { Auth } from 'src/iam/decorators/auth.decorator';
import { AuthType } from 'src/iam/enums/auth-type.enum';

@Auth(AuthType.None)
@Controller('boards')
export class BoardsController {
  constructor(private readonly boardsService: BoardsService) {}

  @Get(':id')
  async getTestMessage(@Param('id') id: number) {
    return await this.boardsService.getBoardDataById(id);
  }
}
