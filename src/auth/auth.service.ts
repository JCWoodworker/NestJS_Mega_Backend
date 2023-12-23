import { Injectable, Inject } from '@nestjs/common';
import { UsersService } from 'src/users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigType } from '@nestjs/config';
import authConfig from '../config/auth.config';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private usersService: UsersService,
    @Inject(authConfig.KEY)
    private readonly authConfiguration: ConfigType<typeof authConfig>,
  ) {}

  saltConfig = this.authConfiguration.saltRounds;

  // async signIn(username: string, pass: string) {
  //   const user = await this.usersService.findOneByUsername(
  //     username.toLowerCase(),
  //   );
  //   if (!user) {
  //     throw new UnauthorizedException();
  //   }
  //   const isMatch = await bcrypt.compare(pass, user.password);
  //   if (!isMatch) {
  //     throw new UnauthorizedException();
  //   }
  //   return user;
  // }
}
