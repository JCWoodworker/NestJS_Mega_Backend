import * as bcrypt from 'bcrypt';
import { Injectable, Inject } from '@nestjs/common';
import { UsersService } from 'src/users/users.service';
import { JwtService } from '@nestjs/jwt';
import { PasswordResetRequestDto } from './dto/password-reset-request.dto';
import { PasswordUpdateRequestDto } from './dto/password-update-request.dto';
import { jwtConstants } from 'src/auth/constants';
import { v4 as uuidv4 } from 'uuid';
import { ConfigType } from '@nestjs/config';
import authConfig from '../../config/auth.config';
import appConfig from 'src/config/app.config';

@Injectable()
export class PasswordResetService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    @Inject(authConfig.KEY)
    private readonly authConfiguration: ConfigType<typeof authConfig>,
    @Inject(appConfig.KEY)
    private readonly appConfiguration: ConfigType<typeof appConfig>,
  ) {}

  saltConfig = this.authConfiguration.others.saltRounds;
  environment = this.appConfiguration.environment;

  async handlePasswordResetRequest(
    passwordResetRequestDto: PasswordResetRequestDto,
  ) {
    const userEmailRequestingToResetPassword = passwordResetRequestDto.email;
    const message = `If a user with email ${userEmailRequestingToResetPassword} exists, a password reset link will be sent to them`;
    const user = await this.usersService.findOneByEmail(
      userEmailRequestingToResetPassword,
    );

    if (!user) {
      return {
        message: message,
      };
    }

    // Write logic that sends this passwordResetUrl to the user's email address
    // Use your preferred email service (mine are either Email JS or Sendgrid)
    const passwordResetUrl = await this.generatePasswordResetUrl(
      userEmailRequestingToResetPassword,
    );

    if (this.environment === 'development' || this.environment === 'preprod') {
      console.log(passwordResetUrl);
      return {
        userMessage: message,
        developerMessage: `Environment = ${this.environment}`,
        passwordResetUrl: passwordResetUrl,
      };
    }

    return {
      message: message,
    };
  }

  async generatePasswordResetUrl(userEmailToReset: string) {
    const resetMessage = `If user with email ${userEmailToReset} exists, a password reset link will be sent`;

    const user = await this.usersService.findOneByEmail(userEmailToReset);
    if (!user) {
      return {
        message: resetMessage,
      };
    }

    const payload = {
      sub: user.userId,
      username: user.username,
      userType: user.userType,
    };

    const passwordResetToken = uuidv4();
    const passwordResetJwt = await this.jwtService.signAsync({
      ...payload,
      secret: jwtConstants.passwordResetSecret,
      expiresIn: new Date(Date.now() + 1000 * 60 * 3),
    });

    const salt = bcrypt.genSaltSync(this.saltConfig);
    const encryptedPasswordResetToken = await bcrypt.hash(
      passwordResetToken,
      salt,
    );
    const encryptedPasswordResetJwt = await bcrypt.hash(passwordResetJwt, salt);

    await this.usersService.update(
      user.userId,
      {
        passwordResetJwt: encryptedPasswordResetJwt,
        passwordResetToken: encryptedPasswordResetToken,
      },
      true,
    );

    const passwordResetUrl = `http://localhost:3000/password-reset/reset?jwt=${passwordResetJwt}&token=${passwordResetToken}`;

    return passwordResetUrl;
  }

  async verifyPasswordResetTokenAndJwt(jwt: string, token: string) {
    const decodedJwt = await this.jwtService.verifyAsync(jwt);
    const user = await this.usersService.findOneById(decodedJwt.sub);

    if (!user.passwordResetToken || !user.passwordResetJwt) {
      throw new Error(
        'User does not have a password reset token and/or jwt stored',
      );
    }

    const isValidJwt = await bcrypt.compare(jwt, user?.passwordResetJwt);
    const isValidToken = await bcrypt.compare(token, user?.passwordResetToken);

    if (!isValidJwt && !isValidToken) {
      return { status: false };
    }

    return { status: true, user };
  }

  async updateUserWithNewPassword(body: PasswordUpdateRequestDto) {
    const { token, jwt, newPassword, confirmPassword } = body;

    let statusMessage: string = '';

    const tokenVerification = await this.verifyPasswordResetTokenAndJwt(
      jwt,
      token,
    );
    if (!tokenVerification.status) {
      statusMessage = 'Invalid password reset token and/or jwt';
      throw new Error('Invalid password reset token and/or jwt');
    }
    if (newPassword !== confirmPassword) {
      statusMessage = 'Passwords do not match';
      throw new Error('Passwords do not match');
    }
    tokenVerification.status
      ? (statusMessage = 'Tokens have been verified')
      : (statusMessage = 'An Unexpected Error Occurred');

    const salt = bcrypt.genSaltSync(this.saltConfig);
    const encryptedPassword = await bcrypt.hash(newPassword, salt);

    await this.usersService.update(
      tokenVerification.user.userId,
      {
        password: encryptedPassword,
        refreshToken: null,
        passwordResetToken: null,
        passwordResetJwt: null,
      },
      true,
    );

    statusMessage = 'Password Reset Successful';

    return {
      status: true,
      message: statusMessage,
    };
  }
}
