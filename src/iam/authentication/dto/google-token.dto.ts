import { IsNotEmpty, IsOptional } from 'class-validator';

export class GoogleTokenDto {
  @IsNotEmpty()
  token: string;

  @IsOptional()
  subappId?: string;

  @IsOptional()
  subscriptionTier?: string;
}
