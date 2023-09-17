import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserService } from '../user/user.service';

@Injectable()
export class AuthService {
  constructor(private userService: UserService) {}

  //  MAKE SURE TO USE bcrypt WHEN PERSISTING PASSWORDS TO A DB

  async signIn(username: string, pass: string): Promise<any> {
    const user = await this.userService.findOne(username);
    if (user?.password !== pass) {
      throw new UnauthorizedException();
    }
    const { password, ...result } = user;
    console.log(password);
    // TODO: Generate a JWT and return it here
    // instead of the user object
    return result;
  }
}
