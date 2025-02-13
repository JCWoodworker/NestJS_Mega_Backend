import { Controller, Get } from '@nestjs/common';
import { UsersService } from '@users/users.service';
import { ActiveUser } from '@iam/decorators/active-user.decorator';
import { ActiveUserData } from '@iam/interfaces/active-user-data.interface';
import { Roles } from '@iam/authorization/decorators/roles.decorator';
import { Role } from '@users/enums/role.enum';

@Controller()
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
