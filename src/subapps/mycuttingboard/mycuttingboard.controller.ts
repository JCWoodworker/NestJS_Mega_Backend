import {
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

@Controller('')
export class MycuttingboardController {
  constructor(private readonly mycuttingboardService: MycuttingboardService) {}

  @Post('user-role-swap')
  async userRoleSwap() {
    return this.mycuttingboardService.userRoleSwap();
  }
}
