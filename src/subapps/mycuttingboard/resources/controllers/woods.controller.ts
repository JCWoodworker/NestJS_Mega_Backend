import { Controller, Get } from '@nestjs/common';
import { WoodsService } from './services/woods.service';

@Controller('woods')
export class WoodsController {
  constructor(private readonly woodsService: WoodsService) {}

  @Get('')
  async getTestMessage() {
    return await this.woodsService.getMessage();
  }
}
