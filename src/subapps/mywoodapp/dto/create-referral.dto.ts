import { IsString, IsNotEmpty, IsISO8601 } from 'class-validator';

export class CreateReferralDto {
  @IsString()
  @IsNotEmpty()
  source: string;

  @IsISO8601()
  timestamp: string;
}
