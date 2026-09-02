import { Controller, Get, Inject, Query, Res } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Response } from 'express';

import { Auth } from '@iam/decorators/auth.decorator';
import { AuthType } from '@iam/enums/auth-type.enum';

import schwabConfig from '@schwab/config/schwab.config';

import { SchwabAuthService } from './schwab-auth.service';

/**
 * OAuth endpoints are public (`AuthType.None`): Schwab's own redirect flow
 * cannot attach this backend's JWT bearer token, since the browser is
 * navigating directly per Schwab's 3-legged OAuth2/PKCE flow.
 */
@Auth(AuthType.None)
@Controller('auth')
export class SchwabAuthController {
  constructor(
    private readonly schwabAuthService: SchwabAuthService,
    @Inject(schwabConfig.KEY)
    private readonly config: ConfigType<typeof schwabConfig>,
  ) {}

  @Get('connect')
  connect(@Res() res: Response) {
    const authorizationUrl = this.schwabAuthService.buildAuthorizationUrl();
    return res.redirect(authorizationUrl);
  }

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    await this.schwabAuthService.handleCallback(code, state);
    return res.redirect(this.config.redirectSuccessUrl);
  }

  @Get('status')
  status() {
    return this.schwabAuthService.getConnectionStatus();
  }
}
