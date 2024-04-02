import { Controller, Post } from '@nestjs/common';
import { Auth } from 'src/iam/decorators/auth.decorator';
import { AuthType } from 'src/iam/enums/auth-type.enum';

@Auth(AuthType.None)
@Controller('authentication/facebook')
export class FacebookAuthenticationController {
  @Post()
  async authenticate() {
    return 'Facebook Auth Not Yet Implemented';
  }
}
