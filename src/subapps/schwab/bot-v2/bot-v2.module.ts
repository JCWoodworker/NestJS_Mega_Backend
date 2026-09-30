import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BotModule } from '@schwab/bot/bot.module';
import { MarketDataModule } from '@schwab/market-data/market-data.module';
import { SchwabStreamingModule } from '@schwab/streaming/schwab-streaming.module';

import { BotV2Controller } from './bot-v2.controller';
import { BotV2EngineService } from './bot-v2-engine.service';
import { BotV2SettingsService } from './bot-v2-settings.service';
import { BotV2StateService } from './bot-v2-state.service';
import { BotV2Event } from './entities/bot-v2-event.entity';
import { BotV2Settings } from './entities/bot-v2-settings.entity';
import { BotV2State } from './entities/bot-v2-state.entity';
import { BotV2Trade } from './entities/bot-v2-trade.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([BotV2Settings, BotV2State, BotV2Trade, BotV2Event]),
    forwardRef(() => BotModule),
    MarketDataModule,
    forwardRef(() => SchwabStreamingModule),
  ],
  controllers: [BotV2Controller],
  providers: [BotV2SettingsService, BotV2StateService, BotV2EngineService],
  exports: [BotV2SettingsService, BotV2StateService, BotV2EngineService],
})
export class BotV2Module {}
