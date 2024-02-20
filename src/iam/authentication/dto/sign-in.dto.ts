import {
  IsEmail,
  IsOptional,
  IsStrongPassword,
  IsString,
  IsEnum,
} from 'class-validator';
import { AuthActionType } from '../dto/dto.enum';

export class SignInDto {
  @IsEmail()
  email: string;

  @IsStrongPassword()
  password: string;

  @IsEnum(AuthActionType)
  signUpOrIn: string;

  @IsString()
  subappId: string;

  @IsOptional()
  subscriptionTier?: string;
}
