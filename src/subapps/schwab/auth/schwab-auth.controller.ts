import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';

import { Auth } from '@iam/decorators/auth.decorator';
import { AuthType } from '@iam/enums/auth-type.enum';

import { SchwabAuthService } from './schwab-auth.service';

/**
 * Schwab OAuth. Only the broker callback is public — `/connect` and `/status`
 * require this backend's JWT so an unauthenticated browser cannot rebind the
 * shared Schwab token row.
 */
@Controller('auth')
export class SchwabAuthController {
  constructor(private readonly schwabAuthService: SchwabAuthService) {}

  /**
   * Authenticated: returns the Schwab authorize URL as JSON so the FE can
   * `window.open` it with a Bearer-gated request (redirect responses cannot
   * carry Authorization). `returnTo` must be an allowlisted origin / scheme.
   */
  @Get('connect')
  connect(@Query('returnTo') returnTo: string) {
    return {
      authorizationUrl:
        this.schwabAuthService.buildAuthorizationUrl(returnTo),
    };
  }

  /** Public: Schwab redirects here without our JWT. */
  @Auth(AuthType.None)
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const redirectTo = await this.schwabAuthService.handleCallback(code, state);
    return res.redirect(redirectTo);
  }

  @Get('status')
  status() {
    return this.schwabAuthService.getConnectionStatus();
  }
}
