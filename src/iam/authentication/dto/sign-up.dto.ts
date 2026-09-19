import { IsEmail, IsStrongPassword, IsEnum, IsOptional, IsIn } from 'class-validator';

import { AuthActionType } from '@iam/authentication/dto/dto.enum';
import { SIGNUP_SOURCES } from '@iam/authentication/signup-source.util';

export class SignUpDto {
  @IsEmail()
  email: string;

  @IsStrongPassword()
  password: string;

  @IsEnum(AuthActionType)
  signUpOrIn: string;

  /** Product that created this account — stamped onto `users.signup_sources`. */
  @IsOptional()
  @IsIn([...SIGNUP_SOURCES])
  signupSource?: string;
}
