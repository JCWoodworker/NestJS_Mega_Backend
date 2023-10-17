import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from 'src/users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async signIn(
    username: string,
    pass: string,
    accessTokenexpiration: string,
    refreshTokenExpiration: string,
  ) {
    const user = await this.usersService.findOneByUsername(username);
    const isMatch = await bcrypt.compare(pass, user.password);
    if (!isMatch) {
      throw new UnauthorizedException();
    }
    const payload = {
      sub: user.userId,
      username: user.username,
      userType: user.userType,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync({
        ...payload,
        expiresIn: accessTokenexpiration,
      }),
      this.jwtService.signAsync({
        ...payload,
        expiresIn: refreshTokenExpiration,
      }),
    ]);

    const salt = bcrypt.genSaltSync(parseInt(process.env.SALT_ROUNDS));
    const encryptedRefreshToken = await bcrypt.hash(refreshToken, salt);
    await this.usersService.update(user.userId, {
      refreshToken: encryptedRefreshToken,
    });

    return [accessToken, refreshToken];
  }

  async refreshToken(
    currentRefreshToken: string,
    userId: number,
    userType: string,
    accessTokenexpiration: string = '15m',
    refreshTokenExpiration: string = '7d',
  ) {
    const user = await this.usersService.findOneById(userId, userType);
    const isMatch = await bcrypt.compare(
      currentRefreshToken,
      user.refreshToken,
    );
    if (!isMatch) {
      throw new UnauthorizedException(
        'Access Denied --> Please try your login again',
      );
    }
    const payload = {
      sub: user.userId,
      username: user.username,
      userType: user.userType,
    };
    const [newAccessToken, newRefreshToken] = await Promise.all([
      this.jwtService.signAsync({
        ...payload,
        expiresIn: accessTokenexpiration,
      }),
      this.jwtService.signAsync({
        ...payload,
        expiresIn: refreshTokenExpiration,
      }),
    ]);
    const salt = bcrypt.genSaltSync(parseInt(process.env.SALT_ROUNDS));
    const encryptedRefreshToken = await bcrypt.hash(newRefreshToken, salt);
    await this.usersService.update(user.userId, {
      refreshToken: encryptedRefreshToken,
    });

    return [newAccessToken, newRefreshToken];
  }
}
