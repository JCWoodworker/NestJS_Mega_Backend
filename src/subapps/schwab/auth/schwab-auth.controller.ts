import { Controller, Get, Query, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';

import { ActiveUser } from '@iam/decorators/active-user.decorator';
import { Auth } from '@iam/decorators/auth.decorator';
import { AuthType } from '@iam/enums/auth-type.enum';

import { SchwabAuthService } from './schwab-auth.service';

/**
 * Schwab OAuth. Only the broker callback is public — `/connect` and `/status`
 * require this backend's JWT so an unauthenticated browser cannot rebind the
 * shared Schwab token row.
 *
 * Overrides the app-wide 10 req/60s default, which this controller was the only
 * Schwab controller still inheriting. The desk polls `/status` every 2s while a
 * connection is pending (30/min), so it throttled itself out roughly 20 seconds
 * into the flow — and because `/callback` shares the budget, an exhausted quota
 * could reject the broker's redirect and fail the handshake outright, not just
 * stall the badge. 60/min covers the poll with headroom.
 */
@Throttle({ default: { limit: 60, ttl: 60000 } })
@Controller('auth')
export class SchwabAuthController {
  constructor(private readonly schwabAuthService: SchwabAuthService) {}

  /**
   * Authenticated: returns the Schwab authorize URL as JSON so the FE can
   * `window.open` it with a Bearer-gated request (redirect responses cannot
   * carry Authorization). `returnTo` must be an allowlisted origin / scheme.
   */
  @Get('connect')
  connect(
    @ActiveUser('sub') userId: string,
    @Query('returnTo') returnTo: string,
  ) {
    return {
      authorizationUrl: this.schwabAuthService.buildAuthorizationUrl(
        userId,
        returnTo,
      ),
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
  status(@ActiveUser('sub') userId: string) {
    return this.schwabAuthService.getConnectionStatus(userId);
  }
}
