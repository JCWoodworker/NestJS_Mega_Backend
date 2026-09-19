import { IsEmail, IsStrongPassword, IsEnum, IsOptional, IsIn } from 'class-validator';

import { AuthActionType } from '@iam/authentication/dto/dto.enum';
import { SIGNUP_SOURCES } from '@iam/authentication/signup-source.util';

export class SignInDto {
  @IsEmail()
  email: string;

  @IsStrongPassword()
  password: string;

  @IsEnum(AuthActionType)
  signUpOrIn: string;

  /** When present, appends this product to `users.signup_sources` if missing. */
  @IsOptional()
  @IsIn([...SIGNUP_SOURCES])
  signupSource?: string;
}
