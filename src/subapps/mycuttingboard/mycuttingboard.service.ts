import { Injectable } from '@nestjs/common';

import { BoardsService } from './resources/services/boards.service';
import { LinksService } from './resources/services/links.service';
import { WoodsService } from './resources/services/woods.service';
import { AdminService } from './resources/services/admin.service';
import { ProductService } from './resources/services/product.service';

@Injectable()
export class MycuttingboardService {
  constructor(
    private readonly boardsService: BoardsService,
    private readonly linksService: LinksService,
    private readonly woodsService: WoodsService,
    private readonly adminService: AdminService,
    private readonly productService: ProductService,
  ) {}
}
