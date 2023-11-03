import { Module } from '@nestjs/common';
import { PasswordResetService } from './password_reset.service';
import { PasswordResetController } from './password_reset.controller';
import { UsersModule } from 'src/users/users.module';
import { JwtModule } from '@nestjs/jwt';
import { jwtConstants } from '../constants';

@Module({
  imports: [
    UsersModule,
    JwtModule.register({
      secret: jwtConstants.accessSecret,
    }),
  ],
  controllers: [PasswordResetController],
  providers: [PasswordResetService],
})
export class PasswordResetModule {}
