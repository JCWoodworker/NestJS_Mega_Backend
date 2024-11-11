// TODO: Remove all commented out code!!

import { Controller, Post, Body } from '@nestjs/common';
import { GoogleAuthenticationService } from './google-authentication.service';
import { GoogleTokenDto } from '../dto/google-token.dto';
import { Auth } from 'src/iam/decorators/auth.decorator';
import { AuthType } from 'src/iam/enums/auth-type.enum';

@Auth(AuthType.None)
@Controller('google')
export class GoogleAuthenticationController {
  constructor(
    private readonly googleAuthService: GoogleAuthenticationService,
  ) {}

  @Post()
  async authenticate(@Body() tokenDto: GoogleTokenDto) {
    return this.googleAuthService.authenticate(
      tokenDto.token,
      // tokenDto.subappId,
      // tokenDto.signUpOrIn,
      // tokenDto.subscriptionTier,
    );
  }
}
