import { Controller } from '@nestjs/common';
import { WoodsService } from '../services/woods.service';

@Controller('woods')
export class WoodsController {
  constructor(private readonly woodsService: WoodsService) {}
}
