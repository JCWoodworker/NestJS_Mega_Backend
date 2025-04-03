import { Controller, Get, Param, Header } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { Auth } from '@iam/decorators/auth.decorator';
import { AuthType } from '@iam/enums/auth-type.enum';

import { ScrapersService } from './scrapers.service';

@Auth(AuthType.None)
@Controller()
export class ScrapersController {
  constructor(private readonly scrapersService: ScrapersService) {}

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Header('Access-Control-Allow-Origin', 'http://localhost:5173')
  @Header('Access-Control-Allow-Methods', 'GET')
  @Get(':id')
  findScraper(@Param('id') id: string): Promise<any> {
    return this.scrapersService.findScraper(id);
  }
}
