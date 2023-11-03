import { Controller, Get } from '@nestjs/common';
import { PasswordResetService } from './password_reset.service';

@Controller('password-reset')
export class PasswordResetController {
  constructor(private readonly passwordResetService: PasswordResetService) {}

  @Get()
  async testingGet() {
    return { message: 'testing /password-reset GET' };
  }
}
