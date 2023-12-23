import { Controller, Get } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UsersService) {}

  @Get('all-users')
  findAll(): Promise<any> {
    return this.userService.findAll();
  }
}
