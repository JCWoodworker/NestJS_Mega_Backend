import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { Role } from '@users/enums/role.enum';

import { Roles } from '@iam/authorization/decorators/roles.decorator';

import { AdminUsersService } from './admin-users.service';
import { AdminLockUserDto, AdminPurgeUserDto } from './dto/admin-user-actions.dto';

/**
 * Strikedesk admin user support + purge. `@Roles(Role.Admin)` only —
 * deliberately without `SchwabOwnerGuard`. `RolesGuard` is global.
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

  @Get(':userId/purge-preview')
  async purgePreview(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.adminUsersService.purgePreview(userId);
  }

  @Post(':userId/export')
  async export(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.adminUsersService.exportAndEmail(userId);
  }

  @Patch(':userId/lock')
  async lock(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: AdminLockUserDto,
  ) {
    return this.adminUsersService.setLocked(userId, dto.locked);
  }

  @Post(':userId/sign-out')
  async signOut(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.adminUsersService.forceSignOut(userId);
  }

  @Post(':userId/disconnect-schwab')
  async disconnectSchwab(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.adminUsersService.disconnectSchwab(userId);
  }

  @Post(':userId/resend-verification')
  async resendVerification(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.adminUsersService.resendVerification(userId);
  }

  @Delete(':userId')
  async purge(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: AdminPurgeUserDto,
  ) {
    return this.adminUsersService.purgeUser(userId, {
      confirmEmail: dto.confirmEmail,
      emailExport: dto.emailExport,
    });
  }
}
