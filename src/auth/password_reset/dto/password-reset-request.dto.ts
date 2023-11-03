import { IsEmail } from 'class-validator';

export class PasswordResetRequestDto {
  @IsEmail()
  readonly email: string;
}
