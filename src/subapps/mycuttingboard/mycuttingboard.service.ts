import { Injectable } from '@nestjs/common';

import { BoardsService } from './resources/controllers/services/boards.service';
import { LinksService } from './resources/controllers/services/links.service';
import { WoodsService } from './resources/controllers/services/woods.service';

// import { CreateBoardDto } from './dto/create-board.dto';
// import { UpdateBoardDto } from './dto/update-board.dto';

@Injectable()
export class MycuttingboardService {
  constructor(
    private readonly boardsService: BoardsService,
    private readonly linksService: LinksService,
    private readonly woodsService: WoodsService,
  ) {}
}
