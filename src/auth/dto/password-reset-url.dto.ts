import { IsEmail } from 'class-validator';

export class GeneratePasswordResetUrlDto {
  @IsEmail()
  email: string;
}
