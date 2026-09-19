import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { Role } from '@users/enums/role.enum';

import { Roles } from '@iam/authorization/decorators/roles.decorator';

import { AdminUsersService } from './admin-users.service';

/**
 * Everyone on the platform, not just the improvement-loop owner — so this is
 * `@Roles(Role.Admin)` only, deliberately without `SchwabOwnerGuard`. That
 * guard checks identity against `SCHWAB_OWNER_USER_ID`, which answers a
 * different question ("is this the paper-bot owner") than the one this
 * endpoint needs ("is this an admin"). `RolesGuard` itself is global
 * (`APP_GUARD` in app.module.ts), so no `@UseGuards` is needed here.
 */
@Roles(Role.Admin)
@Throttle({ default: { limit: 30, ttl: 60000 } })
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  async overview(@Query('from') from?: string, @Query('to') to?: string) {
    return this.adminUsersService.getOverview({ from, to });
  }
}
