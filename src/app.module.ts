import * as Joi from '@hapi/joi';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, RouterModule } from '@nestjs/core';
import { DevtoolsModule } from '@nestjs/devtools-integration';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UsersModule } from '@users/users.module';

import appConfig from '@config/app.config';
import authConfig from '@config/auth.config';

import { AccessTokenGuard } from '@iam/authentication/guards/access-token/access-token.guard';
import { AuthenticationGuard } from '@iam/authentication/guards/authentication/authentication.guard';
import { RolesGuard } from '@iam/authorization/guards/roles.guard';
import jwtConfig from '@iam/config/jwt.config';
import { IamModule } from '@iam/iam.module';

import { GeminiModule } from '@gemini/gemini.module';

import { IronviewModule } from '@subapps/ironview/ironview.module';
import { MycuttingboardModule } from '@subapps/mycuttingboard/mycuttingboard.module';
import { MywoodappModule } from '@subapps/mywoodapp/mywoodapp.module';
import { OnlyBizlinksModule } from '@subapps/onlybizlinks/onlybizlinks.module';
import { RilwModule } from '@subapps/rilw/rilw.module';
import { SchwabAuthModule } from '@subapps/schwab/auth/schwab-auth.module';
import { BotModule } from '@subapps/schwab/bot/bot.module';
import { MarketDataModule } from '@subapps/schwab/market-data/market-data.module';
import { OrdersModule } from '@subapps/schwab/orders/orders.module';
import { PnlModule } from '@subapps/schwab/pnl/pnl.module';
import { SubappsModule } from '@subapps/subapps.module';
import { WoodpricingModule } from '@subapps/woodpricing/woodpricing.module';

import { ScrapersModule } from '@scrapers/scrapers.module';

import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    DevtoolsModule.register({
      http: process.env.ENVIRONMENT !== 'development',
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, authConfig],
      validationSchema: Joi.object({
        ENVIRONMENT: Joi.string().required(),
        DATABASE_URL: Joi.string().required(),
      }),
    }),
    ConfigModule.forFeature(jwtConfig),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        url: process.env.DATABASE_URL,
        autoLoadEntities: true,
      }),
    }),
    JwtModule.registerAsync(jwtConfig.asProvider()),
    ScheduleModule.forRoot(),
    UsersModule,
    IamModule,
    GeminiModule,
    SubappsModule,
    ScrapersModule,
    RouterModule.register([
      {
        path: 'users',
        module: UsersModule,
      },
      {
        path: 'authentication',
        module: IamModule,
      },
      {
        path: 'ai',
        module: GeminiModule,
      },
      {
        path: 'scrapers',
        module: ScrapersModule,
      },
      {
        path: 'subapps',
        module: SubappsModule,
        children: [
          {
            path: 'mycuttingboard',
            module: MycuttingboardModule,
          },
          {
            path: 'mywoodapp',
            module: MywoodappModule,
          },
          {
            path: 'onlybizlinks',
            module: OnlyBizlinksModule,
          },
          {
            path: 'ironview',
            module: IronviewModule,
          },
          {
            path: 'rilw',
            module: RilwModule,
          },
          {
            path: 'woodpricing',
            module: WoodpricingModule,
          },
          // SchwabModule itself declares no controllers directly - it only
          // aggregates SchwabAuthModule/OrdersModule/SchwabStreamingModule.
          // RouterModule's path-prefixing metadata is registered per exact
          // module class, so we must point it at the modules that actually
          // own the controllers, or their routes fall back to the bare
          // global prefix (this bit us once already - see the `schwab`
          // deploy history).
          {
            path: 'schwab',
            module: SchwabAuthModule,
          },
          {
            path: 'schwab',
            module: OrdersModule,
          },
          {
            path: 'schwab',
            module: MarketDataModule,
          },
          {
            path: 'schwab',
            module: PnlModule,
          },
          {
            path: 'schwab',
            module: BotModule,
          },
        ],
      },
    ]),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60000,
          limit: 10,
        },
      ],
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: AuthenticationGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    AccessTokenGuard,
  ],
})
export class AppModule {}
