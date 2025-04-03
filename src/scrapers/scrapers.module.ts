import { Module } from '@nestjs/common';

import { ScrapersController } from './scrapers.controller';
import { ScrapersService } from './scrapers.service';

@Module({
  controllers: [ScrapersController],
  providers: [ScrapersService],
})
export class ScrapersModule {}
