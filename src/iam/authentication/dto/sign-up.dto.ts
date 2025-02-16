import { IsEmail, IsStrongPassword, IsEnum } from 'class-validator';

import { AuthActionType } from '@iam/authentication/dto/dto.enum';

export class SignUpDto {
  @IsEmail()
  email: string;

  @IsStrongPassword()
  password: string;

  @IsEnum(AuthActionType)
  signUpOrIn: string;
}
