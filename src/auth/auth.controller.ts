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
    const [accessToken, refreshToken] = await this.authService.signIn(
      signInDto.username,
      signInDto.password,
      '15m',
      '7d',
    );
    res
      .cookie('access_token', accessToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        expires: new Date(Date.now() + 60000 * 15),
      })
      .cookie('refresh_token', refreshToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        expires: new Date(Date.now() + 60000 * 60 * 24 * 7),
      })
      .send({
        status: 'Login successful',
      });
  }

  @Post('refresh')
  refreshToken() {
    //  TODO
    //  Hash the refresh token and save it to the users table
    //  Use the refresh token to generate a new access token
    //  Return the new access token
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
