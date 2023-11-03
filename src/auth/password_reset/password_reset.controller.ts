import { Controller, Get, Post, Body, Query, Render } from '@nestjs/common';
import { PasswordResetService } from './password_reset.service';
import { SkipAuth } from '../decorators/skipAuth.decorator';
import { PasswordResetRequestDto } from './dto/password-reset-request.dto';

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
  @Render('password-reset')
  async verifyTokensAndRenderPasswordResetPage(@Query() query: any) {
    if (!query?.jwt && !query?.token) {
      return { message: 'No token and/or jwt provided' };
    }
    return await this.passwordResetService.verifyTokensAndRenderPasswordResetPage();
  }

  @Post('reset')
  async updateUserWithNewPassword() {
    return await this.passwordResetService.updateUserWithNewPassword();
  }

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
