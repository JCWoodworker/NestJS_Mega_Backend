import { HttpModule, HttpService } from '@nestjs/axios';
import { forwardRef, Injectable, Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import type { InternalAxiosRequestConfig } from 'axios';

import { SchwabAuthModule } from '@schwab/auth/schwab-auth.module';
import { SchwabAuthService } from '@schwab/auth/schwab-auth.service';
import schwabConfig from '@schwab/config/schwab.config';

import { SCHWAB_HTTP_TIMEOUT_MS, schwabHttpsAgent } from './schwab-https-agent';

/**
 * Attaches the live Schwab access token to every outgoing request on this
 * module's HttpService instance. Runs once at module init since Axios
 * interceptors are registered on the underlying instance, not per-request.
 */
@Injectable()
class SchwabBearerInterceptor implements OnModuleInit {
  constructor(
    private readonly httpService: HttpService,
    private readonly authService: SchwabAuthService,
  ) {}

  onModuleInit(): void {
    this.httpService.axiosRef.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        const accessToken = await this.authService.getValidAccessToken();
        config.headers.set('Authorization', `Bearer ${accessToken}`);
        return config;
      },
    );
  }
}

/**
 * Bearer-authenticated Schwab Trader API client, shared by the orders and
 * account-snapshot services. Reuses the keep-alive HTTPS agent to minimize
 * handshake overhead on order dispatch.
 */
@Module({
  imports: [
    // Cycle: SchwabHttpModule -> SchwabAuthModule -> OrdersModule ->
    // SchwabHttpModule (OrdersModule needs this module's HttpService;
    // SchwabAuthModule needs OrdersService to resolve accountHash on
    // /auth/status). forwardRef breaks it on both ends.
    forwardRef(() => SchwabAuthModule),
    HttpModule.registerAsync({
      imports: [ConfigModule.forFeature(schwabConfig)],
      inject: [schwabConfig.KEY],
      useFactory: (config: ConfigType<typeof schwabConfig>) => ({
        baseURL: config.apiBaseUrl,
        timeout: SCHWAB_HTTP_TIMEOUT_MS,
        maxRedirects: 0,
        httpsAgent: schwabHttpsAgent,
      }),
    }),
  ],
  providers: [SchwabBearerInterceptor],
  exports: [HttpModule],
})
export class SchwabHttpModule {}
