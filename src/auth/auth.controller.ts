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
import { Response } from 'express';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { SkipAuth } from './decorators/skipAuth.decorator';
import authConfig from '../config/auth.config';
import { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    @Inject(authConfig.KEY)
    private readonly authConfiguration: ConfigType<typeof authConfig>,
  ) {}

  secureCookie =
    this.authConfiguration.others.secureCookie === 'true' ? true : false;

  @SkipAuth()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async signIn(
    @Body() signInDto: Record<string, any>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const [accessToken, refreshToken, userIngestion] =
      await this.authService.signIn(
        signInDto.username,
        signInDto.password,
        this.authConfiguration.expirations.jwtAccess,
        this.authConfiguration.expirations.jwtRefresh,
      );
    // Remove this!!
    console.log(
      `Access token: ${accessToken}, Refresh token: ${refreshToken}, secureCookie: ${this.secureCookie}`,
    );
    res
      .cookie('access_token', accessToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: this.secureCookie,
        expires: new Date(
          Date.now() + this.authConfiguration.expirations.authCookie,
        ),
      })
      .cookie('refresh_token', refreshToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: this.secureCookie,
        expires: new Date(
          Date.now() + this.authConfiguration.expirations.refreshCookie,
        ),
      })
      .send({
        userIngestion,
      });
  }

  @SkipAuth()
  @Post('refresh')
  async refreshToken(@Req() req, @Res({ passthrough: true }) res) {
    if (!req.cookies.refresh_token) {
      // Remove this!!
      console.log(`Refresh token not found`);
      return {
        message: 'Refresh token not found',
      };
    }

    const [newAccessToken, newRefreshToken] =
      await this.authService.refreshToken(
        req.cookies.refresh_token,
        req.body.email,
      );
    // Remove this!!
    console.log(
      `newAccessToken: ${newAccessToken} - newRefreshToken: ${newRefreshToken}`,
    );
    res
      .cookie('access_token', newAccessToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: this.secureCookie,
        expires: new Date(
          Date.now() + this.authConfiguration.expirations.authCookie,
        ),
      })
      .cookie('refresh_token', newRefreshToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: this.secureCookie,
        expires: new Date(
          Date.now() + this.authConfiguration.expirations.refreshCookie,
        ),
      })
      .send({
        status: `Token refresh successful - Woooooo!`,
      });
  }

  @Post('logout')
  async logout(@Req() req, @Res({ passthrough: true }) res) {
    if (!req.user) {
      return {
        message: 'User not found',
      };
    }
    await this.authService.clearRefreshToken(req.user.sub);
    res
      .clearCookie('access_token')
      .clearCookie('refresh_token')
      .send({
        status: `User ${req.user.username} logged out successfully`,
      });
  }

  @UseGuards(AuthGuard)
  @Get('profile')
  getProfile(@Req() req) {
    return req.user;
  }
}
