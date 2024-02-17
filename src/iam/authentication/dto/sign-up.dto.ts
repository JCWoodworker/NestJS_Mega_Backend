import { IsEmail, IsStrongPassword, IsString } from 'class-validator';

export class SignUpDto {
  @IsEmail()
  email: string;

  @IsStrongPassword()
  password: string;

  @IsString()
  subappId: string;

  // Subscription tier must be 'basic', 'mid', 'high', or 'unlimited'
  @IsString()
  subscriptionTier: string;
}
