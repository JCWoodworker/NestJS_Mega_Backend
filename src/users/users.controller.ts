import { Controller, Get } from '@nestjs/common';
import { UsersService } from './users.service';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data.interface';
import { Roles } from 'src/iam/authorization/decorators/roles.decorator';
import { Role } from 'src/users/enums/role.enum';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UsersService) {}

  @Roles(Role.Admin)
  @Get('all-users')
  findAll(): Promise<any> {
    return this.userService.findAll();
  }

  @Roles(Role.Admin, Role.Basic)
  @Get('user-profile')
  findOne(@ActiveUser() user: ActiveUserData): Promise<any> {
    return this.userService.findOneById(user.sub);
  }
}
