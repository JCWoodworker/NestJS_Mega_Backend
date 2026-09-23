import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { Role } from '@users/enums/role.enum';

import { ActiveUser } from '@iam/decorators/active-user.decorator';
import { Roles } from '@iam/authorization/decorators/roles.decorator';

import { AccountDeletionService } from './account-deletion.service';
import {
  FulfillDeletionRequestDto,
  RejectDeletionRequestDto,
} from './dto/account-deletion.dto';

@Roles(Role.Admin)
@Throttle({ default: { limit: 30, ttl: 60000 } })
@Controller('admin/deletion-requests')
export class AdminDeletionController {
  constructor(private readonly deletions: AccountDeletionService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.deletions.listForAdmin(status);
  }

  @Post(':id/reject')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @ActiveUser('sub') adminId: string,
    @Body() dto: RejectDeletionRequestDto,
  ) {
    return this.deletions.reject(id, adminId, dto.note);
  }

  @Post(':id/fulfill')
  fulfill(
    @Param('id', ParseUUIDPipe) id: string,
    @ActiveUser('sub') adminId: string,
    @Body() dto: FulfillDeletionRequestDto,
  ) {
    return this.deletions.fulfill(id, adminId, dto.emailExport);
  }
}
