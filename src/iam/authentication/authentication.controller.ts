// TODO: Use HTTP ONLY COOKIES for refresh tokens

import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { AuthenticationService } from '@iam/authentication/authentication.service';
import { RefreshTokenDto } from '@iam/authentication/dto/refresh-token.dto';
import { SignInDto } from '@iam/authentication/dto/sign-in.dto';
import { SignUpDto } from '@iam/authentication/dto/sign-up.dto';
import { Auth } from '@iam/decorators/auth.decorator';
import { AuthType } from '@iam/enums/auth-type.enum';

/**
 * These three are the app's only unauthenticated write endpoints, so they are
 * the whole public attack surface. They inherited the app-wide 10 req/60s
 * default, which is far too generous now that sign-up is open: at that rate a
 * single IP could create 14,400 accounts a day.
 *
 * Limits are per-IP (the throttler's default tracker) and chosen against real
 * usage rather than round numbers — a human signs up once, mistypes a
 * password a handful of times, and refreshes a token every 15 minutes.
 */
@Auth(AuthType.None)
@Controller()
export class AuthenticationController {
  constructor(private readonly authService: AuthenticationService) {}

  /**
   * Nobody legitimately creates several accounts an hour from one address.
   * This is the main brake on mass registration until email verification
   * exists.
   */
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Post('sign-up')
  async signUp(@Body() signUpDto: SignUpDto) {
    return this.authService.signUp(signUpDto);
  }

  /**
   * Credential stuffing is the risk here, not volume. Ten attempts per five
   * minutes leaves room for a forgotten password while making a password
   * spray impractical.
   */
  @Throttle({ default: { limit: 10, ttl: 300_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('sign-in')
  async signIn(@Body() signInDto: SignInDto) {
    return this.authService.signIn(signInDto);
  }

  /**
   * Deliberately roomier: a legitimate client refreshes on a timer and on
   * every socket reconnect, and throttling this logs real users out. Rotation
   * already invalidates a reused refresh token, which is the actual defence.
   */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('refresh-tokens')
  async refreshTokens(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshTokens(refreshTokenDto);
  }

  // This code can be used for http only cookies
  // @HttpCode(HttpStatus.OK)
  // @Post('sign-in')
  // async signIn(
  //   @Res({ passthrough: true }) response: Response,
  //   @Body() signInDto: SignInDto,
  // ) {
  //   const accessToken = await this.authService.signIn(signInDto);
  //   response.cookie('accessToken', accessToken, {
  //     secure: true,
  //     httpOnly: true,
  //     sameSite: true,
  //   });
  // }
}
