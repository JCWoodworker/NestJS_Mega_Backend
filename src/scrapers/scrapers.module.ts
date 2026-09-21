import { Module } from '@nestjs/common';

import { ScrapersController } from './scrapers.controller';
import { ScrapersService } from './scrapers.service';

/**
 * The app-wide rate limiter used to be registered here, which made a global
 * concern depend on this module staying imported. It now lives in `AppModule`
 * alongside the other global guards.
 */
@Module({
  controllers: [ScrapersController],
  providers: [ScrapersService],
})
export class ScrapersModule {}
