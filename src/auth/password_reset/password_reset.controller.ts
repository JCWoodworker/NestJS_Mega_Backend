import { Controller, Get, Post, Body } from '@nestjs/common';
import { PasswordResetService } from './password_reset.service';
import { SkipAuth } from '../decorators/skipAuth.decorator';
import { PasswordResetRequestDto } from './dto/password-reset-request.dto';
// import { PasswordResetUpdateDto } from './dto/password-reset-update.dto';

@Controller('password-reset')
export class PasswordResetController {
  constructor(private readonly passwordResetService: PasswordResetService) {}

  @SkipAuth()
  @Post('request')
  async handlePasswordResetRequest(
    @Body() passwordResetRequestDto: PasswordResetRequestDto,
  ) {
    return await this.passwordResetService.handlePasswordResetRequest(
      passwordResetRequestDto,
    );
  }

  @SkipAuth()
  @Get('reset')
  async verifyTokensAndRenderPasswordResetPage() {
    return await this.passwordResetService.verifyTokensAndRenderPasswordResetPage();
  }

  @Post('reset')
  async updateUserWithNewPassword() {
    return await this.passwordResetService.updateUserWithNewPassword();
  }

  // @SkipAuth()
  // @Post('request')
  // async handlePasswordResetRequest(
  //   @Body() resetPasswordDto: PasswordResetRequestDto,
  // ) {
  //   return await this.passwordResetService.handlePasswordResetRequest();
  // }

  // @SkipAuth()
  // @Get('reset')
  // async resetPassword(@Res({ passthrough: true }) res, @Query() query: any) {
  //   if (!query.jwt && query.token) {
  //     return { message: 'invalid url' };
  //   }
  //   res.clearCookie('access_token').clearCookie('refresh_token');

  //   const successfulValidationInformation =
  //     await this.passwordResetService.acceptPasswordResetUrl(query.jwt, query.token);

  //   if (!successfulValidationInformation.status) {
  //     return res.send(successfulValidationInformation.message);
  //   } else {
  //     res.cookie('access_token', {
  //       httpOnly: true,
  //       sameSite: 'lax',
  //       secure: false,
  //       expires: new Date(Date.now() + 60000 * 3),
  //     });
  //     res.send(successfulValidationInformation);
  //   }
  // }

  // @Post('reset')
  // async updateUserPassword(@Body() body: PasswordResetUpdateDto, @Res() res) {
  //   const successfulUpdate = await this.passwordResetService.updateUserPassword(
  //     body.newPassword,
  //     body.newPasswordRepeated,
  //   );
  //   debugger;
  //   if (!successfulUpdate) {
  //     return res.send({
  //       status: `Something didn't work ... are you trying to hack me???`,
  //     });
  //   } else {
  //     res.send({
  //       status: `Password successfully changed, Please log in again with your new password`,
  //     });
  //   }
  // }
}
