import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { timingSafeEqual } from 'crypto';

import { AuthType } from '@iam/enums/auth-type.enum';

import { Auth } from '@iam/decorators/auth.decorator';

import { BotFixtureService } from './bot-fixture.service';

/**
 * Recorded market data for an offline replay.
 *
 * Deliberately not behind the admin JWT like the rest of the lab: the caller
 * is a Cursor cloud agent on a throwaway VM with no user session, holding only
 * a token passed to it for that run. What it can read is SPY bars and option
 * chain snapshots — public market data we happened to record. No account,
 * position, order or P&L data is reachable here.
 *
 * Disabled entirely unless `BOT_FIXTURE_TOKEN` is set, so an app that never
 * runs the improvement loop exposes nothing.
 */
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@Auth(AuthType.None)
@Controller('bot/fixture')
export class BotFixtureController {
  constructor(private readonly fixtureService: BotFixtureService) {}

  @Get()
  async fixture(
    @Headers('authorization') authorization: string | undefined,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    this.assertToken(authorization);
    return this.fixtureService.getFixture({ from, to });
  }

  private assertToken(authorization: string | undefined): void {
    const expected = process.env.BOT_FIXTURE_TOKEN;
    if (!expected) {
      throw new ServiceUnavailableException('Fixture endpoint is disabled');
    }

    const presented = (authorization ?? '').replace(/^Bearer\s+/i, '');
    const a = Buffer.from(presented);
    const b = Buffer.from(expected);
    // Compare in constant time, and only when the lengths already match —
    // timingSafeEqual throws on a length mismatch, which would itself leak.
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException('Invalid fixture token');
    }
  }
}
