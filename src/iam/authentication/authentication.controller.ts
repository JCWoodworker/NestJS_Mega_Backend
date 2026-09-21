// TODO: Use HTTP ONLY COOKIES for refresh tokens

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { AuthenticationService } from '@iam/authentication/authentication.service';
import { RefreshTokenDto } from '@iam/authentication/dto/refresh-token.dto';
import { SignInDto } from '@iam/authentication/dto/sign-in.dto';
import { SignUpDto } from '@iam/authentication/dto/sign-up.dto';
import { ActiveUser } from '@iam/decorators/active-user.decorator';
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

  /**
   * Public — the token in the query string, not a session, is the proof of
   * identity here. Idempotent: an already-verified account or a link clicked
   * twice both just return success rather than erroring.
   */
  @Get('verify-email')
  async verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  /**
   * Bearer, not public — overrides the class-level `AuthType.None`. Under
   * the soft gate the caller is already signed in, so this reads the user
   * off their own token instead of taking an email param, which would
   * otherwise let anyone re-trigger mail to an address they don't own.
   */
  @Auth(AuthType.Bearer)
  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('resend-verification')
  async resendVerification(@ActiveUser('sub') userId: string) {
    return this.authService.resendVerificationEmail(userId);
  }

  /**
   * Revokes the caller's refresh token so signing out ends the session
   * server-side rather than only clearing browser storage.
   *
   * Note that refresh tokens are stored one row per user, so this ends every
   * session for that account, not just the calling device. Their access tokens
   * stay valid until they expire — this stops the session from being renewed,
   * it is not an immediate kill switch.
   */
  @Auth(AuthType.Bearer)
  @HttpCode(HttpStatus.OK)
  @Post('sign-out')
  async signOut(@ActiveUser('sub') userId: string) {
    return this.authService.signOut(userId);
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
