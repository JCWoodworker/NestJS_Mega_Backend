import { IsEmail, IsStrongPassword, IsString, IsEnum } from 'class-validator';
import { AuthActionType } from './dto.enum';

export class SignUpDto {
  @IsEmail()
  email: string;

  @IsStrongPassword()
  password: string;

  @IsEnum(AuthActionType)
  signUpOrIn: string;

  @IsString()
  subappId: string;

  @IsString()
  subscriptionTier: string;
}
