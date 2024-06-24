import {
  Body,
  Controller,
  // Get,
  // Param,
  Post,
  // Body,
  // Patch,
  // Param,
  // Delete,
} from '@nestjs/common';
import { MycuttingboardService } from './mycuttingboard.service';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data.interface';

export type NewUserRole = {
  role: string;
};

@Controller('')
export class MycuttingboardController {
  constructor(private readonly mycuttingboardService: MycuttingboardService) {}

  @Post('user-role-swap')
  async userRoleSwap(
    @Body() newUserRole: NewUserRole,
    @ActiveUser() user: ActiveUserData,
  ) {
    return this.mycuttingboardService.userRoleSwap(
      user.sub,
      user.role,
      newUserRole.role,
    );
  }
}
