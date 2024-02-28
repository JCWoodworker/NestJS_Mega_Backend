import { Controller, Get } from '@nestjs/common';
import { BoardsService } from '../services/boards.service';

@Controller('boards')
export class BoardsController {
  constructor(private readonly boardsService: BoardsService) {}

  @Get('')
  async findAll() {
    return await this.boardsService.getMessage();
  }
}
