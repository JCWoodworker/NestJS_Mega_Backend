import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SchwabAuthModule } from '@schwab/auth/schwab-auth.module';
import schwabConfig from '@schwab/config/schwab.config';
import { SchwabHttpModule } from '@schwab/http/schwab-http.module';
import { MarketDataModule } from '@schwab/market-data/market-data.module';
import { OrdersModule } from '@schwab/orders/orders.module';
import { SchwabRealizedTrade } from '@schwab/pnl/entities/schwab-realized-trade.entity';
import { SchwabTradeFill } from '@schwab/pnl/entities/schwab-trade-fill.entity';
import { PnlModule } from '@schwab/pnl/pnl.module';
import { SchwabSharedModule } from '@schwab/shared/schwab-shared.module';
import { SchwabStreamingModule } from '@schwab/streaming/schwab-streaming.module';

import { BotAdminController } from './bot-admin.controller';
import { BotAnalyzerService } from './bot-analyzer.service';
import { BotCorpusHealthService } from './bot-corpus-health.service';
import { BotEngineService } from './bot-engine.service';
import { BotEventService } from './bot-event.service';
import { BotExecutionService } from './bot-execution.service';
import { BotMarketDataService } from './bot-market-data.service';
import { BotRecordingService } from './bot-recording.service';
import { BotSettingsService } from './bot-settings.service';
import { BotStateService } from './bot-state.service';
import { BotSupervisorService } from './bot-supervisor.service';
import { BotController } from './bot.controller';
import { BotCapitalEvent } from './entities/bot-capital-event.entity';
import { BotChainSnapshot } from './entities/bot-chain-snapshot.entity';
import { BotDailyReport } from './entities/bot-daily-report.entity';
import { BotEvent } from './entities/bot-event.entity';
import { BotMarketDay } from './entities/bot-market-day.entity';
import { BotSettings } from './entities/bot-settings.entity';
import { BotState } from './entities/bot-state.entity';
import { BotTradeTape } from './entities/bot-trade-tape.entity';
import { BotTrade } from './entities/bot-trade.entity';

@Module({
  imports: [
    ConfigModule.forFeature(schwabConfig),
    TypeOrmModule.forFeature([
      BotSettings,
      BotState,
      BotEvent,
      BotTradeTape,
      BotTrade,
      BotChainSnapshot,
      BotMarketDay,
      BotCapitalEvent,
      BotDailyReport,
      SchwabTradeFill,
      SchwabRealizedTrade,
    ]),
    SchwabHttpModule,
    forwardRef(() => SchwabAuthModule),
    OrdersModule,
    SchwabSharedModule,
    MarketDataModule,
    forwardRef(() => SchwabStreamingModule),
    PnlModule,
  ],
  controllers: [BotController, BotAdminController],
  providers: [
    BotSettingsService,
    BotStateService,
    BotEventService,
    BotMarketDataService,
    BotExecutionService,
    BotRecordingService,
    BotEngineService,
    BotCorpusHealthService,
    BotSupervisorService,
    BotAnalyzerService,
  ],
  exports: [BotStateService, BotSettingsService, BotEventService],
})
export class BotModule {}
