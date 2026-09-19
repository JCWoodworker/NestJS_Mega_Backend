import { IsNotEmpty, IsEnum, IsOptional, IsIn } from 'class-validator';

import { AuthActionType } from '@iam/authentication/dto/dto.enum';
import { SIGNUP_SOURCES } from '@iam/authentication/signup-source.util';

export class GoogleTokenDto {
  @IsNotEmpty()
  token: string;

  /** Optional — older clients omit it; new ones send signin/signup. */
  @IsOptional()
  @IsEnum(AuthActionType)
  signUpOrIn?: string;

  /** Product that initiated Google auth — stamped onto `users.signup_sources`. */
  @IsOptional()
  @IsIn([...SIGNUP_SOURCES])
  signupSource?: string;
}
