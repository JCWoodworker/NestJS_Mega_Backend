import {
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

import { BotSettingsSnapshotSource } from '../entities/bot-settings-snapshot.entity';

export class ListSettingsHistoryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  /** Page older than this epoch ms. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  beforeAt?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  from?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  to?: number;

  @IsOptional()
  @IsEnum(BotSettingsSnapshotSource)
  source?: BotSettingsSnapshotSource;
}
