import { IsString, MinLength, MaxLength } from 'class-validator';

export class InstrumentSearchQueryDto {
  /** Ticker fragment or company name (Schwab symbol-search + desc-search). */
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  q: string;
}
