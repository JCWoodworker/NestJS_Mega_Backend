import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { Role } from '@users/enums/role.enum';

import { Roles } from '@iam/authorization/decorators/roles.decorator';

import { SchwabOwnerGuard } from '@schwab/shared/schwab-owner.guard';

import { BotCorpusHealthService } from './bot-corpus-health.service';
import { BotSupervisorService } from './bot-supervisor.service';

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
  constructor(
    private readonly corpusHealthService: BotCorpusHealthService,
    private readonly supervisorService: BotSupervisorService,
  ) {}

  /**
   * Live supervisor state plus the blockers currently preventing an arm.
   *
   * Blockers are recomputed per request rather than replayed from the last
   * decision, so a lockout cleared by hand disappears from the panel
   * immediately instead of at the next minute tick.
   */
  @Get('supervisor')
  async supervisor() {
    return this.supervisorService.getStatus();
  }

  /**
   * Clears whatever a refusal is waiting on: flattens a leftover position,
   * clears a stale lockout, tops the paper ledger back over the floor.
   *
   * This is the deliberate human judgement the unattended path refuses to
   * make for itself. It does not arm — the next tick does, so the normal
   * safety checks still apply.
   */
  @Post('supervisor/reconcile')
  @HttpCode(HttpStatus.OK)
  async reconcile() {
    return this.supervisorService.reconcile();
  }

  /** Arms now, skipping the arm-time window but not the safety blockers. */
  @Post('supervisor/arm')
  @HttpCode(HttpStatus.OK)
  async arm() {
    return this.supervisorService.armNow();
  }

  /** Flatten and halt now. */
  @Post('supervisor/stand-down')
  @HttpCode(HttpStatus.OK)
  async standDown() {
    return this.supervisorService.standDownNow();
  }

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
