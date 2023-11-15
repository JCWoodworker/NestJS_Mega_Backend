import { Controller, Get, Render } from '@nestjs/common';
import { AppService } from './app.service';
import { SkipAuth } from './auth/decorators/skipAuth.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @SkipAuth()
  @Get()
  @Render('index')
  getIntroMessage(): string {
    return this.appService.getIntroMessage();
  }
}
