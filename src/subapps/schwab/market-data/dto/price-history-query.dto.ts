import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';

const PERIOD_TYPES = ['day', 'month', 'year', 'ytd'] as const;
const FREQUENCY_TYPES = ['minute', 'daily', 'weekly', 'monthly'] as const;

export type PeriodType = (typeof PERIOD_TYPES)[number];
export type FrequencyType = (typeof FREQUENCY_TYPES)[number];

/**
 * Pass-through query params for Schwab's `GET /pricehistory` (frontend
 * contract section 9a). Schwab itself enforces the legal periodType/period/
 * frequencyType/frequency combinations - this DTO only validates shape, not
 * that a given combo is one Schwab accepts, so a bad combo still surfaces as
 * a normal 4xx from `MarketDataService` rather than a class-validator error.
 */
export class PriceHistoryQueryDto {
  /** Equity ticker (e.g. "SPY") or 21-char OSI option symbol. */
  @IsString()
  symbol: string;

  @IsOptional()
  @IsIn(PERIOD_TYPES)
  periodType?: PeriodType;

  @IsOptional()
  @IsInt()
  period?: number;

  @IsOptional()
  @IsIn(FREQUENCY_TYPES)
  frequencyType?: FrequencyType;

  @IsOptional()
  @IsInt()
  frequency?: number;

  /** Epoch ms. */
  @IsOptional()
  @IsInt()
  startDate?: number;

  /** Epoch ms. */
  @IsOptional()
  @IsInt()
  endDate?: number;
}
