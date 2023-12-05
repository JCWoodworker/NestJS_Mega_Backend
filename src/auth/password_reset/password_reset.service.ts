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
import * as sgMail from '@sendgrid/mail';
import { calculateIsJwtWithinExpiry } from '../utils/jwtFunctions';

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

    const passwordResetUrl = await this.generatePasswordResetUrl(
      userEmailRequestingToResetPassword,
    );

    // CONTACT SENDGRID SUPPORT - EMAILS ARE PROCESSING BUT NOT SENDING - 11/13/2023
    // const emailSentStatus = await this.sendEmail();
    // emailSentStatus ? console.log('Email sent') : console.log('Email not sent');

    if (this.environment === 'development' || this.environment === 'preprod') {
      console.log(passwordResetUrl);
      return {
        userMessage: message,
        developerMessage: `Environment = ${this.environment}`,
        passwordResetUrl: passwordResetUrl,
      };
    }
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
    // REMOVE THIS AFTER TESTING!!
    console.log(this.authConfiguration.expirations.jwtPasswordReset);

    const passwordResetToken = uuidv4();
    const passwordResetJwt = await this.jwtService.signAsync({
      ...payload,
      secret: jwtConstants.passwordResetSecret,
      expiresIn: this.authConfiguration.expirations.jwtPasswordReset,
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

    let passwordResetUrl = '';
    this.environment === 'development'
      ? (passwordResetUrl = `http://localhost:3000/password-reset/reset?jwt=${passwordResetJwt}&token=${passwordResetToken}`)
      : this.environment === 'preprod'
        ? (passwordResetUrl = `${process.env.PREPROD_DOMAIN}/password-reset/reset?jwt=${passwordResetJwt}&token=${passwordResetToken}`)
        : this.environment === 'prod'
          ? (passwordResetUrl = `${process.env.PROD_DOMAIN}/password-reset/reset?jwt=${passwordResetJwt}&token=${passwordResetToken}`)
          : null;

    return passwordResetUrl;
  }

  async verifyPasswordResetTokenAndJwt(jwt: string, token: string) {
    const decodedJwt = await this.jwtService.verifyAsync(jwt);

    const isTokenWithinExpiry = calculateIsJwtWithinExpiry(decodedJwt);
    if (!isTokenWithinExpiry) {
      return { status: false };
    }

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
    let passwordUpdateStatus = false;

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
    passwordUpdateStatus = true;

    return {
      status: passwordUpdateStatus,
      message: statusMessage,
    };
  }

  async sendEmail() {
    const msg = {
      to: 'development.testing.jc@gmail.com',
      from: 'development.testing.jc@gmail.com',
      subject: 'Sending with SendGrid is Fun',
      text: 'and easy to do anywhere, even with Node.js',
      html: '<strong>and easy to do anywhere, even with Node.js</strong>',
    };

    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    try {
      await sgMail.send(msg);
      console.log('Email sent');
      return true;
    } catch (error) {
      console.error('Error sending email:', error);
      return false;
    }
  }
}
