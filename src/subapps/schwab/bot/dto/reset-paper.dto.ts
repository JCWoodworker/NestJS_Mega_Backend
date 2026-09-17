import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Min } from 'class-validator';

import { MIN_EQUITY } from '../bot-equity-thresholds.const';

export class ResetPaperDto {
  /** Starting paper equity / settled cash. Defaults to $6,000 server-side. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(MIN_EQUITY)
  equity?: number;
}
