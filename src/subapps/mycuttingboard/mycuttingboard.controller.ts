import {
  // Body,
  Controller,
  Get,
  // Param,
  // Post,
  // Body,
  // Patch,
  // Param,
  // Delete,
} from '@nestjs/common';
import { MycuttingboardService } from './mycuttingboard.service';
// import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
// import { ActiveUserData } from 'src/iam/interfaces/active-user-data.interface';
// import { Auth } from 'src/iam/decorators/auth.decorator';
// import { AuthType } from '@iam/enums/auth-type.enum';

export type NewUserRole = {
  role: string;
};

@Controller('')
export class MycuttingboardController {
  constructor(private readonly mycuttingboardService: MycuttingboardService) {}

  // @Auth(AuthType.None)
  @Get('test-message')
  testMessage() {
    return 'Hello this is a test';
  }

  // @Post('user-role-swap')
  // async userRoleSwap(
  //   @Body() newUserRole: NewUserRole,
  //   @ActiveUser() user: ActiveUserData,
  // ) {
  //   return this.mycuttingboardService.userRoleSwap(
  //     user.sub,
  //     user.role,
  //     newUserRole.role,
  //   );
  // }
}
