import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';

import { Auth } from '@iam/decorators/auth.decorator';
import { AuthType } from '@iam/enums/auth-type.enum';

import { SchwabAuthService } from './schwab-auth.service';

/**
 * OAuth endpoints are public (`AuthType.None`): Schwab's own redirect flow
 * cannot attach this backend's JWT bearer token, since the browser is
 * navigating directly per Schwab's 3-legged OAuth2/PKCE flow.
 */
@Auth(AuthType.None)
@Controller('auth')
export class SchwabAuthController {
  constructor(private readonly schwabAuthService: SchwabAuthService) {}

  /**
   * `returnTo` (optional): where to send the browser after a successful
   * connect, overriding the configured Expo deep link. Use this from a web
   * client (Expo web, a plain browser tab) that can't handle
   * `myapp://schwab-connected`. Must be an origin already in
   * ALLOWED_ORIGINS/ALLOWED_ORIGINS_DEVELOPMENT, or use the `exp://`/
   * `myapp://` custom schemes - anything else is rejected.
   */
  @Get('connect')
  connect(@Query('returnTo') returnTo: string, @Res() res: Response) {
    const authorizationUrl =
      this.schwabAuthService.buildAuthorizationUrl(returnTo);
    return res.redirect(authorizationUrl);
  }

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
