import { Controller, Get, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { Role } from '@users/enums/role.enum';

import { Roles } from '@iam/authorization/decorators/roles.decorator';

import { SchwabOwnerGuard } from '@schwab/shared/schwab-owner.guard';

import { BotCorpusHealthService } from './bot-corpus-health.service';

/**
 * The lab's control plane — operating the bot improvement loop, not trading.
 *
 * Double-gated on purpose. `@Roles(Role.Admin)` is the coarse check, but it
 * reads the role off the JWT payload rather than a live row, so a revoked
 * admin keeps a usable token until it expires. `SchwabOwnerGuard` re-reads
 * `SCHWAB_OWNER_USER_ID` from config on every request, so both a DB column
 * and an env-pinned user id must agree before anything here answers.
 *
 * Mounted separately from `BotController` so the customer-facing bot
 * endpoints cannot accidentally inherit these guards, and vice versa.
 */
@Throttle({ default: { limit: 60, ttl: 60000 } })
@Roles(Role.Admin)
@UseGuards(SchwabOwnerGuard)
@Controller('bot/admin')
export class BotAdminController {
  constructor(private readonly corpusHealthService: BotCorpusHealthService) {}

  /**
   * Row counts for the recording tables against what a session should
   * produce. The corpus is written unattended and read weeks later, so a
   * recorder that dies is otherwise invisible until the analysis has nothing
   * to run on.
   */
  @Get('corpus-health')
  async corpusHealth() {
    return this.corpusHealthService.getHealth();
  }
}
