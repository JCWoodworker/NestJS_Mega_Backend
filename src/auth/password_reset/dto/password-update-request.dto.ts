import { IsStrongPassword, IsJWT, IsUUID } from 'class-validator';

export class PasswordUpdateRequestDto {
  @IsStrongPassword()
  readonly newPassword: string;

  @IsStrongPassword()
  readonly confirmPassword: string;

  @IsJWT()
  readonly jwt: string;

  @IsUUID()
  readonly token: string;
}
