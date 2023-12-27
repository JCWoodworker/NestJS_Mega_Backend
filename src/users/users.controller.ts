import { Controller, Get } from '@nestjs/common';
import { UsersService } from './users.service';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data.interface';
import { convertJwtExpirationToLocalDateTime } from 'src/debugging/convertJwtDates';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UsersService) {}

  @Get('all-users')
  findAll(@ActiveUser() user: ActiveUserData): Promise<any> {
    console.log(
      `JWT expiration for user ID: ${user.sub} with email: ${
        user.email
      } in local date and time: ${convertJwtExpirationToLocalDateTime(
        user.exp,
      )}`,
    );
    return this.userService.findAll();
  }

  @Get('user-profile')
  findOne(@ActiveUser() user: ActiveUserData): Promise<any> {
    return this.userService.findOneById(user.sub);
  }
}
