import { IsNotEmpty, IsEnum } from 'class-validator';
import { AuthActionType } from '@iam/authentication/dto/dto.enum';

export class GoogleTokenDto {
  @IsNotEmpty()
  token: string;

  @IsEnum(AuthActionType)
  signUpOrIn: string;
}
