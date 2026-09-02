import { IsInt, IsString, Min } from 'class-validator';

export class ReversePositionDto {
  @IsString()
  accountHash: string;

  @IsString()
  closeSymbol: string;

  @IsString()
  openSymbol: string;

  @IsInt()
  @Min(1)
  quantity: number;
}
