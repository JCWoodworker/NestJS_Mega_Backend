import { IsString, IsStrongPassword, IsEmail } from 'class-validator';
export class CreateUserDto {
  @IsString()
  readonly username: string;

  @IsStrongPassword()
  readonly password: string;

  @IsEmail()
  readonly email: string;

  @IsString()
  readonly userType: string;

  readonly refreshToken: string;

  readonly passwordResetToken: string;

  readonly passwordResetJwt: string;
}
