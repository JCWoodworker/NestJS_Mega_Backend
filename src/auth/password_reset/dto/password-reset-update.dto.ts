import { PartialType } from '@nestjs/mapped-types';
import { PasswordResetRequestDto } from './password-reset-request.dto';
import { IsString } from 'class-validator';

export class PasswordResetUpdateDto extends PartialType(
  PasswordResetRequestDto,
) {
  @IsString()
  readonly newPassword?: string;

  @IsString()
  readonly newPasswordRepeated?: string;
}
