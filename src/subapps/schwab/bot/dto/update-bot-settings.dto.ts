import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateBotSettingsDto {
  @IsOptional()
  @IsBoolean()
  vwapPullbackEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  orb5mEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(100)
  riskPct?: number;

  @IsOptional()
  @IsBoolean()
  useMaxLossUsd?: boolean;

  @IsOptional()
  @IsNumber()
  maxLossUsd?: number | null;

  @IsOptional()
  @IsBoolean()
  useMaxLossPct?: boolean;

  @IsOptional()
  @IsNumber()
  maxLossPct?: number | null;

  @IsOptional()
  @IsBoolean()
  useProfitUsd?: boolean;

  @IsOptional()
  @IsNumber()
  profitUsd?: number | null;

  @IsOptional()
  @IsBoolean()
  useProfitPctDayStart?: boolean;

  @IsOptional()
  @IsNumber()
  profitPctDayStart?: number | null;

  @IsOptional()
  @IsBoolean()
  useProfitPctCurrent?: boolean;

  @IsOptional()
  @IsNumber()
  profitPctCurrent?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minPremium?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxPremium?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxSpreadPct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  deltaMin?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  deltaMax?: number;

  @IsOptional()
  @IsString()
  @Matches(HH_MM)
  tradeWindowStart?: string;

  @IsOptional()
  @IsString()
  @Matches(HH_MM)
  tradeWindowEnd?: string;

  @IsOptional()
  @IsString()
  @Matches(HH_MM)
  hardFlattenTime?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  cooldownMins?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  atrPeriod?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  paperSlippageCents?: number;
}
