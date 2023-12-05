import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Render,
  Res,
} from '@nestjs/common';
import { PasswordResetService } from './password_reset.service';
import { SkipAuth } from '../decorators/skipAuth.decorator';
import { PasswordResetRequestDto } from './dto/password-reset-request.dto';
import { PasswordUpdateRequestDto } from './dto/password-update-request.dto';

@Controller('password-reset')
export class PasswordResetController {
  constructor(private readonly passwordResetService: PasswordResetService) {}

  @SkipAuth()
  @Post('request')
  async handlePasswordResetRequest(
    @Body() passwordResetRequestDto: PasswordResetRequestDto,
  ) {
    return await this.passwordResetService.handlePasswordResetRequest(
      passwordResetRequestDto,
    );
  }

  @SkipAuth()
  @Get('reset')
  @Render('password-reset')
  async verifyTokensAndRenderPasswordResetPage(@Query() query: any) {
    if (!query?.jwt && !query?.token) {
      return { message: 'No token and/or jwt provided' };
    }
    const isValid =
      await this.passwordResetService.verifyPasswordResetTokenAndJwt(
        query.jwt,
        query.token,
      );

    return { isValid: isValid, jwt: query.jwt, token: query.token };
  }

  @SkipAuth()
  @Post('reset')
  @Render('reset-status')
  async updateUserWithNewPassword(
    @Body() body: PasswordUpdateRequestDto,
    @Res() res,
  ) {
    const passwordUpdate =
      await this.passwordResetService.updateUserWithNewPassword(body);
    res.clearCookie('access_token').clearCookie('refresh_token');
    return {
      message: passwordUpdate.message,
      status: passwordUpdate.status,
    };
  }
}
