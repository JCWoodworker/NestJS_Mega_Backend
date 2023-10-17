import {
  Body,
  Controller,
  Get,
  Req,
  Res,
  UseGuards,
  Post,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { SkipAuth } from './decorators/skipAuth.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @SkipAuth()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async signIn(
    @Body() signInDto: Record<string, any>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const [accessToken, refreshToken] = [
      await this.authService.signIn(
        signInDto.username,
        signInDto.password,
        '15m',
      ),
      await this.authService.signIn(
        signInDto.username,
        signInDto.password,
        '7d',
      ),
    ];
    res
      .cookie('access_token', accessToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        expires: new Date(Date.now() + 60000 * 15),
      })
      .send({ status: 'ok' });
  }

  @Post('refresh')
  refreshToken() {
    return {
      message: 'Placeholder for refreshing tokens - no actions taken yet',
    };
  }

  @UseGuards(AuthGuard)
  @Get('profile')
  getProfile(@Req() req) {
    return req.user;
  }
}
