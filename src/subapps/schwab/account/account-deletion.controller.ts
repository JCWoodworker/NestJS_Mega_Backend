import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { ActiveUser } from '@iam/decorators/active-user.decorator';

import { AccountDeletionService } from './account-deletion.service';
import { CreateDeletionRequestDto } from './dto/account-deletion.dto';

/**
 * Self-serve deletion requests for any signed-in Strikedesk user.
 * Admins still fulfill via `/admin/deletion-requests/:id/fulfill` (purge).
 */
@Throttle({ default: { limit: 20, ttl: 60000 } })
@Controller('account/deletion-request')
export class AccountDeletionController {
  constructor(private readonly deletions: AccountDeletionService) {}

  @Get()
  getMine(@ActiveUser('sub') userId: string) {
    return this.deletions.getMine(userId);
  }

  @Post()
  create(
    @ActiveUser('sub') userId: string,
    @Body() dto: CreateDeletionRequestDto,
  ) {
    return this.deletions.create(userId, {
      reason: dto.reason,
      emailExport: dto.emailExport,
    });
  }

  @Delete()
  cancel(@ActiveUser('sub') userId: string) {
    return this.deletions.cancelMine(userId);
  }
}
