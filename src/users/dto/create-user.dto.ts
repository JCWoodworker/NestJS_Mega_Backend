import { IsString } from 'class-validator';
export class CreateUserDto {
  @IsString()
  readonly username: string;

  @IsString()
  readonly password: string;

  @IsString()
  readonly email: string;

  @IsString()
  readonly userType: string;

  readonly refreshToken: string;

  readonly passwordResetToken: string;
}
