import { IsEmail, IsStrongPassword, IsString } from 'class-validator';

export class SignUpDto {
  @IsEmail()
  email: string;

  @IsStrongPassword()
  password: string;

  @IsString()
  subappId: string;
}
