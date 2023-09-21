import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';

@Module({
  controllers: [UserController],
  providers: [
    UserService,
    // The following object is necessary in order to import and use the custom SkipAuth() decorator
  ],
  exports: [UserService],
})
export class UserModule {}
