import {
  Controller,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';

import { Auth } from '@iam/decorators/auth.decorator';
import { AuthType } from '@iam/enums/auth-type.enum';

import { CreateReferralDto } from './dto/create-referral.dto';
import { ReferralService } from './referral.service';

@Auth(AuthType.None)
@Controller('referrals')
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createReferralDto: CreateReferralDto,
    @Req() request: Request,
  ) {
    const ipAddress =
      (request.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      request.ip;
    const userAgent = request.headers['user-agent'];

    return this.referralService.create(createReferralDto, ipAddress, userAgent);
  }
}
