import { Injectable } from '@nestjs/common';
import { UsersService } from 'src/users/users.service';
import { JwtService } from '@nestjs/jwt';
import { PasswordResetRequestDto } from './dto/password-reset-request.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class PasswordResetService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

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
    console.log(passwordResetUrl);

    return {
      message: message,
    };
  }

  generatePasswordResetUrl = async (userEmailToReset: string) => {
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
    const passwordResetToken = 'asdflkjasdklfjhasdlkfjhasdflkjhasdf';
    const passwordResetJwt = await this.jwtService.signAsync({
      ...payload,
      expiresIn: new Date(Date.now() + 60000 * 5),
    });
    const salt = bcrypt.genSaltSync(parseInt(process.env.SALT_ROUNDS));
    const encryptedPasswordResetJwt = await bcrypt.hash(passwordResetJwt, salt);
    const encryptedPasswordResetToken = await bcrypt.hash(
      passwordResetToken,
      salt,
    );

    await this.usersService.update(
      user.userId,
      {
        passwordResetJwt: encryptedPasswordResetJwt,
        passwordResetToken: encryptedPasswordResetToken,
      },
      true,
    );

    const passwordResetUrl = `http://localhost:3000/auth/reset_password/reset?jwt=${passwordResetJwt}&token=${passwordResetToken}`;

    return {
      passwordResetUrl: passwordResetUrl,
    };
  };

  async verifyTokensAndRenderPasswordResetPage() {
    return { endpointPurpose: 'verify tokens and render password reset page' };
  }

  async updateUserWithNewPassword() {
    return { endpointPurpose: 'update user with new password' };
  }

  // acceptPasswordResetUrl = async (jwt: string, token: string) => {
  //   const decodedJwt = await this.jwtService.verify(jwt);
  //   const user = await this.usersService.findOneById(
  //     decodedJwt.sub,
  //     decodedJwt.userType,
  //   );
  //   const isValidJwt = await bcrypt.compare(jwt, user?.passwordResetJwt);
  //   const isValidToken = await bcrypt.compare(token, user?.passwordResetToken);
  //   let validationStatus = false;
  //   let message =
  //     'Something is wrong ... you messed up somehow, not us.  Good luck in life ...';

  //   if (isValidJwt && isValidToken) {
  //     validationStatus = true;
  //     message = `Validated Successfully - You've got 3 minutes to reset your password.`;
  //   }
  //   const validationInformation = {
  //     message: message,
  //     status: validationStatus,
  //   };
  //   return validationInformation;
  // };

  // updateUserPassword = async (
  //   newPassword: string,
  //   newPasswordRepeated: string,
  // ) => {
  //   debugger;
  //   const responseBody = {
  //     message: 'Password reset update will eventually take place here',
  //     newPassword: newPassword,
  //     newPasswordRepeated: newPasswordRepeated,
  //   };
  //   return responseBody;
  // };
}
