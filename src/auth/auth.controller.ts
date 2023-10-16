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
    const accessToken = await this.authService.signIn(
      signInDto.username,
      signInDto.password,
    );
    res
      .cookie('access_token', accessToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        expires: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .send({ status: 'ok' });
  }

  @UseGuards(AuthGuard)
  @Get('profile')
  getProfile(@Req() req) {
    return req.user;
  }
}
