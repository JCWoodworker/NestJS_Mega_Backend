import { Module } from '@nestjs/common';
import { PasswordResetService } from './password_reset.service';
import { PasswordResetController } from './password_reset.controller';

@Module({
  controllers: [PasswordResetController],
  providers: [PasswordResetService],
})
export class PasswordResetModule {}
