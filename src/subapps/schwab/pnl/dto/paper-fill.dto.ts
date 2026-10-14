import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class PaperFillDto {
  @IsString()
  @MaxLength(128)
  id: string;

  @IsString()
  @MaxLength(64)
  symbol: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNumber()
  @IsPositive()
  price: number;

  /** Epoch milliseconds. */
  @IsNumber()
  @Min(1_000_000_000_000)
  at: number;

  @IsIn(['OPEN', 'CLOSE'])
  side: 'OPEN' | 'CLOSE';

  @IsIn(['MARKET', 'STOP'])
  orderType: 'MARKET' | 'STOP';

  @IsOptional()
  @IsNumber()
  @IsPositive()
  openPrice?: number;

  @IsOptional()
  @IsNumber()
  openedAt?: number;

  @IsOptional()
  @IsNumber()
  realizedPnl?: number;

  @IsOptional()
  @IsIn(['SELL', 'FLATTEN', 'STOP'])
  exitReason?: 'SELL' | 'FLATTEN' | 'STOP';
}

export class SavePaperFillsDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PaperFillDto)
  fills: PaperFillDto[];
}
