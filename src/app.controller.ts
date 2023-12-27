import { Controller, Get, Render } from '@nestjs/common';
import { AppService } from './app.service';
import { Auth } from './iam/decorators/auth.decorator';
import { AuthType } from './iam/enums/auth-type.enum';

@Auth(AuthType.None)
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Render('index')
  getIntroMessage(): string {
    return this.appService.getIntroMessage();
  }
}
