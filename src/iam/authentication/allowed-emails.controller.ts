import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';

import { Role } from '@users/enums/role.enum';

import { AuthAllowlistService } from '@iam/authentication/auth-allowlist.service';
import { AddAllowedEmailDto } from '@iam/authentication/dto/add-allowed-email.dto';
import { Roles } from '@iam/authorization/decorators/roles.decorator';
import { ActiveUser } from '@iam/decorators/active-user.decorator';
import { ActiveUserData } from '@iam/interfaces/active-user-data.interface';

@Roles(Role.Admin)
@Controller('allowed-emails')
export class AllowedEmailsController {
  constructor(private readonly allowlistService: AuthAllowlistService) {}

  @Get()
  async list() {
    return this.allowlistService.list();
  }

  @Post()
  async add(
    @Body() dto: AddAllowedEmailDto,
    @ActiveUser() user: ActiveUserData,
  ) {
    return this.allowlistService.add(dto.email, {
      createdBy: user.sub,
      note: dto.note ?? null,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.allowlistService.removeById(id);
  }
}
