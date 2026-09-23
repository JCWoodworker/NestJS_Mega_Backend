import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateDeletionRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;

  @IsOptional()
  @IsBoolean()
  emailExport?: boolean;
}

export class RejectDeletionRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class FulfillDeletionRequestDto {
  @IsOptional()
  @IsBoolean()
  emailExport?: boolean;
}
