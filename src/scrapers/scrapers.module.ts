import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';

import { ScrapersController } from './scrapers.controller';
import { ScrapersService } from './scrapers.service';

@Module({
  controllers: [ScrapersController],
  providers: [
    ScrapersService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class ScrapersModule {}
