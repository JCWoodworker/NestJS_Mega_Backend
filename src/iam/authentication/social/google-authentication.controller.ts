import { Controller, Post, Body } from '@nestjs/common';
import { GoogleAuthenticationService } from '@iam/authentication/social/google-authentication.service';
import { GoogleTokenDto } from '@iam/authentication/dto/google-token.dto';
import { Auth } from '@iam/decorators/auth.decorator';
import { AuthType } from '@iam/enums/auth-type.enum';

@Auth(AuthType.None)
@Controller('google')
export class GoogleAuthenticationController {
  constructor(
    private readonly googleAuthService: GoogleAuthenticationService,
  ) {}

  @Post()
  async authenticate(@Body() tokenDto: GoogleTokenDto) {
    return this.googleAuthService.authenticate(tokenDto.token);
  }
}
