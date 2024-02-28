import {
  Controller,
  Get,
  // Post,
  // Body,
  // Patch,
  // Param,
  // Delete,
} from '@nestjs/common';
import { MycuttingboardService } from './mycuttingboard.service';
// import { CreateBoardDto } from './dto/create-board.dto';
// import { UpdateBoardDto } from './dto/update-board.dto';
import { Role } from 'src/users/enums/role.enum';
import { Roles } from 'src/iam/authorization/decorators/roles.decorator';

@Roles(Role.Admin, Role.Basic)
@Controller('')
export class MycuttingboardController {
  constructor(private readonly mycuttingboardService: MycuttingboardService) {}

  @Get()
  async sendMessage() {
    return await 'hello world';
  }
}
