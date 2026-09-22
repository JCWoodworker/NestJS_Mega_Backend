import { IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';

export class AdminLockUserDto {
  @IsBoolean()
  locked: boolean;
}

export class AdminPurgeUserDto {
  @IsEmail()
  @IsString()
  confirmEmail: string;

  /** When true, email CSV export via Resend before deleting. Send failure aborts purge. */
  @IsOptional()
  @IsBoolean()
  emailExport?: boolean;
}
