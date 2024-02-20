import { IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { AuthActionType } from './dto.enum';

export class GoogleTokenDto {
  @IsNotEmpty()
  token: string;

  @IsOptional()
  subappId: string;

  @IsEnum(AuthActionType)
  signUpOrIn: string;

  @IsOptional()
  subscriptionTier?: string;
}
