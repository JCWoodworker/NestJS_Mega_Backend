import { Controller, Post, Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { GoogleTokenDto } from '@iam/authentication/dto/google-token.dto';
import { GoogleAuthenticationService } from '@iam/authentication/social/google-authentication.service';
import { Auth } from '@iam/decorators/auth.decorator';
import { AuthType } from '@iam/enums/auth-type.enum';

@Auth(AuthType.None)
@Controller('google')
export class GoogleAuthenticationController {
  constructor(
    private readonly googleAuthService: GoogleAuthenticationService,
  ) {}

  /** Same reasoning as sign-up: Google verifies the email, but account
   * creation still happens here, so the rate has to be bounded. */
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @Post()
  async authenticate(@Body() tokenDto: GoogleTokenDto) {
    return this.googleAuthService.authenticate(tokenDto.token);
  }
}
