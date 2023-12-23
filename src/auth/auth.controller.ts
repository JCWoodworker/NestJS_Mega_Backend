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
import { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import authConfig from '../config/auth.config';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    @Inject(authConfig.KEY)
    private readonly authConfiguration: ConfigType<typeof authConfig>,
  ) {}

  @SkipAuth()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async signIn(
    @Body() signInDto: Record<string, any>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userIngestion = await this.authService.signIn(
      signInDto.username,
      signInDto.password,
    );
    res.send({
      userIngestion,
    });
  }

  @Post('logout')
  async logout(@Req() req, @Res({ passthrough: true }) res) {
    if (!req.user) {
      return {
        message: 'User not found',
      };
    }
    res.send({
      status: `User ${req.user.username} logged out successfully`,
    });
  }

  @UseGuards(AuthGuard)
  @Get('profile')
  getProfile(@Req() req) {
    return req.user;
  }
}
