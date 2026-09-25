import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { Role } from '@users/enums/role.enum';

import { Roles } from '@iam/authorization/decorators/roles.decorator';

import { SchwabOwnerGuard } from '@schwab/shared/schwab-owner.guard';

import { BotAnalyzerService } from './bot-analyzer.service';
import { BotCorpusHealthService } from './bot-corpus-health.service';
import { BotSettingsService } from './bot-settings.service';
import { BotSupervisorService } from './bot-supervisor.service';
import { ListSettingsHistoryDto } from './dto/list-settings-history.dto';

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
    private readonly analyzerService: BotAnalyzerService,
    private readonly botSettingsService: BotSettingsService,
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

  /**
   * Durable bot settings snapshots for weekly rollup attribution
   * (same payload as GET /bot/settings/history, owner-gated here).
   */
  @Get('settings-history')
  async settingsHistory(@Query() query: ListSettingsHistoryDto) {
    return this.botSettingsService.listHistory(query);
  }

  /** Stored nightly reports, newest first. */
  @Get('reports')
  async reports(@Query('limit') limit?: string) {
    return this.analyzerService.listReports(
      Math.min(Math.max(Number(limit) || 30, 1), 120),
    );
  }

  /** One session's full report, including the counterfactual grid. */
  @Get('reports/:dateKey')
  async report(@Param('dateKey') dateKey: string) {
    return this.analyzerService.getReport(dateKey);
  }

  /**
   * Re-runs the analysis for a session on demand.
   *
   * Idempotent — the report's primary key is (user, date), so a re-run
   * overwrites that day rather than appending a second verdict for it.
   */
  @Post('reports/:dateKey/rerun')
  @HttpCode(HttpStatus.OK)
  async rerunReport(@Param('dateKey') dateKey: string) {
    return this.analyzerService.analyzeDay(dateKey);
  }
}
