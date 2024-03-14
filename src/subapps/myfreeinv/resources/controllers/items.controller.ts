import { Controller } from '@nestjs/common';
import { ItemsService } from '../services/items.service';

@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}
}
