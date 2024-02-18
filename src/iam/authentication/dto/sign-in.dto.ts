import {
  IsEmail,
  IsOptional,
  IsStrongPassword,
  IsString,
} from 'class-validator';

export class SignInDto {
  @IsEmail()
  email: string;

  @IsStrongPassword()
  password: string;

  @IsString()
  subappId: string;

  @IsOptional()
  subscriptionTier?: string;
}
