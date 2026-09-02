import { IsInt, IsString, Min } from 'class-validator';

export class FlattenPositionDto {
  @IsString()
  accountHash: string;

  @IsString()
  symbol: string;

  @IsInt()
  @Min(1)
  quantity: number;
}
