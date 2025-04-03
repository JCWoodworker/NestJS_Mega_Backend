import { Controller, Get, Param } from '@nestjs/common';

import { Auth } from '@iam/decorators/auth.decorator';
import { AuthType } from '@iam/enums/auth-type.enum';

import { ScrapersService } from './scrapers.service';

@Auth(AuthType.None)
@Controller()
export class ScrapersController {
  constructor(private readonly scrapersService: ScrapersService) {}

  @Get(':id')
  findScraper(@Param('id') id: string): Promise<any> {
    return this.scrapersService.findScraper(id);
  }
}
