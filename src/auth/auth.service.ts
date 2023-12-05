import * as bcrypt from 'bcrypt';
import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
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

  saltConfig = this.authConfiguration.others.saltRounds;
  async signIn(
    username: string,
    pass: string,
    accessTokenexpiration: string,
    refreshTokenExpiration: string,
  ) {
    const user = await this.usersService.findOneByUsername(username);
    if (!user) {
      throw new UnauthorizedException();
    }
    const isMatch = await bcrypt.compare(pass, user.password);
    if (!isMatch) {
      throw new UnauthorizedException();
    }
    const payload = {
      sub: user.userId,
      username: user.username,
      userType: user.userType,
    };

    // This needs to be it's own function
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

    const salt = bcrypt.genSaltSync(this.saltConfig);
    const encryptedRefreshToken = await bcrypt.hash(refreshToken, salt);
    await this.usersService.update(
      user.userId,
      {
        refreshToken: encryptedRefreshToken,
      },
      true,
    );

    return [accessToken, refreshToken];
  }

  async refreshToken(
    currentRefreshToken: string,
    accessTokenexpiration: string = '15m',
    refreshTokenExpiration: string = '7d',
  ) {
    const decodedJwt = await this.jwtService.verifyAsync(currentRefreshToken);
    const userId = decodedJwt.sub;
    const user = await this.usersService.findOneById(userId);
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
    const salt = bcrypt.genSaltSync(this.saltConfig);
    const encryptedRefreshToken = await bcrypt.hash(newRefreshToken, salt);
    await this.usersService.update(
      user.userId,
      {
        refreshToken: encryptedRefreshToken,
      },
      true,
    );

    return [newAccessToken, newRefreshToken];
  }

  clearRefreshToken = async (userId) => {
    await this.usersService.update(
      userId,
      {
        refreshToken: null,
      },
      true,
    );
    return true;
  };

  clearAllTokens = async (userId) => {
    await this.usersService.update(
      userId,
      { refreshToken: null, passwordResetToken: null, passwordResetJwt: null },
      true,
    );
  };
}
