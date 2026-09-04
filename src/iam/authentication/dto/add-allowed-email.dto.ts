import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class AddAllowedEmailDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  note?: string;
}
