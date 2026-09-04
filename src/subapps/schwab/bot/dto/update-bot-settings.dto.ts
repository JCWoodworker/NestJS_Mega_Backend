import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

import {
  BotCombineMode,
  BotDirection,
  BotStrategy,
} from '../enums/strategy.enum';

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateBotSettingsDto {
  /** Frontend contract §14b shape — array of enabled strategy keys. Translated
   * to `vwapPullbackEnabled`/`orb5mEnabled` internally by BotSettingsService. */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(BotStrategy, { each: true })
  strategiesEnabled?: BotStrategy[];

  /** Operator preference for CALL / PUT / both. Translated to
   * `callsEnabled`/`putsEnabled` internally by BotSettingsService. */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(BotDirection, { each: true })
  directionsEnabled?: BotDirection[];

  /** Only `CONFIRMING` (AND) is currently supported — enum has a single member
   * so this both validates the contract field and rejects anything else. */
  @IsOptional()
  @IsEnum(BotCombineMode)
  combineMode?: BotCombineMode;

  @IsOptional()
  @IsBoolean()
  vwapPullbackEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  orb5mEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  callsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  putsEnabled?: boolean;

  /** Operator-declared account capability — not live-verified against Schwab. */
  @IsOptional()
  @IsBoolean()
  canBuyCalls?: boolean;

  @IsOptional()
  @IsBoolean()
  canBuyPuts?: boolean;

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

  /** Frontend alias for `profitUsd` — accepted on PUT and mapped in
   * BotSettingsService (same forbidNonWhitelisted gap as strategiesEnabled). */
  @IsOptional()
  @IsNumber()
  profitTargetUsd?: number | null;

  @IsOptional()
  @IsBoolean()
  useProfitPctDayStart?: boolean;

  @IsOptional()
  @IsNumber()
  profitPctDayStart?: number | null;

  /** Frontend alias for `profitPctDayStart`. */
  @IsOptional()
  @IsNumber()
  profitTargetPctDayStart?: number | null;

  @IsOptional()
  @IsBoolean()
  useProfitPctCurrent?: boolean;

  @IsOptional()
  @IsNumber()
  profitPctCurrent?: number | null;

  /** Frontend alias for `profitPctCurrent`. */
  @IsOptional()
  @IsNumber()
  profitTargetPctCurrent?: number | null;

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
  @IsBoolean()
  usePremiumStop?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(90)
  premiumStopPct?: number;

  @IsOptional()
  @IsBoolean()
  usePremiumTarget?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(500)
  premiumTargetPct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(20)
  stopAtrMult?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(20)
  targetAtrMult?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  paperSlippageCents?: number;
}
