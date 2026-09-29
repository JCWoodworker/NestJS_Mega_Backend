import { Type } from 'class-transformer';
import {
  ArrayUnique,
  Equals,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

import { BotStrategy } from '@schwab/bot/enums/strategy.enum';

export class ArmBotV2Dto {
  /** Paper only. Live arming is not a V2 route. */
  @Equals(true)
  confirmPaper: boolean;
}

export class UpdateBotV2SettingsDto {
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(Object.values(BotStrategy), { each: true })
  strategiesEnabled?: BotStrategy[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minStrategyAgreement?: number;

  @IsOptional()
  @IsBoolean()
  callsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  putsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  canBuyCalls?: boolean;

  @IsOptional()
  @IsBoolean()
  canBuyPuts?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  riskPct?: number;

  @IsOptional()
  @IsBoolean()
  useRiskAtStop?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxRiskUsd?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minPremium?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxPremium?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxSpreadPct?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  deltaMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  deltaMax?: number;

  @IsOptional()
  @IsString()
  tradeWindowStart?: string;

  @IsOptional()
  @IsString()
  tradeWindowEnd?: string;

  @IsOptional()
  @IsString()
  hardFlattenTime?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cooldownMins?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  atrPeriod?: number;

  @IsOptional()
  @IsBoolean()
  usePremiumStop?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  premiumStopPct?: number;

  @IsOptional()
  @IsBoolean()
  usePremiumTarget?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  premiumTargetPct?: number;

  @IsOptional()
  @IsBoolean()
  useTrailStop?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  trailArmPct?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  trailPct?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  trailMinLockPct?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  stopAtrMult?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  targetAtrMult?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  paperSlippageCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsIn([15, 60])
  signalBarSeconds?: 15 | 60;

  @IsOptional()
  @IsBoolean()
  useScaleOut?: boolean;

  @IsOptional()
  @IsIn(['SPY', 'SPXW'])
  botUnderlying?: 'SPY' | 'SPXW';
}
