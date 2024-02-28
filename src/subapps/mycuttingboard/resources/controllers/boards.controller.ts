import { Controller } from '@nestjs/common';
import { BoardsService } from '../services/boards.service';

@Controller('boards')
export class BoardsController {
  constructor(private readonly boardsService: BoardsService) {}
}
