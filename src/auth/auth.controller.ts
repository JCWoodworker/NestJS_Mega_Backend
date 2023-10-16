import {
  Body,
  Controller,
  Get,
  Request,
  UseGuards,
  Post,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { SkipAuth } from './decorators/skipAuth.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @SkipAuth()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  signIn(@Body() signInDto: Record<string, any>) {
    return this.authService.signIn(signInDto.username, signInDto.password);
  }

  @UseGuards(AuthGuard)
  @Get('profile')
  getProfile(@Request() req) {
    return req.user;
  }
}
