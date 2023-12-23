import { Controller, Get } from '@nestjs/common';
import { UsersService } from './users.service';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data.interface';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UsersService) {}

  @Get('all-users')
  findAll(@ActiveUser() user: ActiveUserData): Promise<any> {
    console.log(user);
    return this.userService.findAll();
  }
}
