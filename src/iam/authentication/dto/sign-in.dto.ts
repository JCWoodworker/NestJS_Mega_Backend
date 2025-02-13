import { IsEmail, IsStrongPassword, IsEnum } from 'class-validator';
import { AuthActionType } from '@iam/authentication/dto/dto.enum';

export class SignInDto {
  @IsEmail()
  email: string;

  @IsStrongPassword()
  password: string;

  @IsEnum(AuthActionType)
  signUpOrIn: string;
}
