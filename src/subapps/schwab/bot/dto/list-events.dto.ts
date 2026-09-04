import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { BotEventType } from '../enums/bot-event-type.enum';
import { BotLane } from '../enums/bot-lane.enum';

function toStringArray(value: unknown): string[] | undefined {
  if (value == null || value === '') return undefined;
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

/**
 * Query for `GET /bot/events` — newest-first log browser with cursor
 * pagination, type/lane filters, date range, and simple text search.
 */
export class ListEventsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;

  /** Catch-up: only rows with id strictly greater than this (newer than cursor). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  afterId?: number;

  /** Older page: only rows with id strictly less than this (scroll back in time). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  beforeId?: number;

  /** Filter by one or more event types (`?type=NO_SIGNAL&type=GATE_SKIP`). */
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsEnum(BotEventType, { each: true })
  type?: BotEventType[];

  @IsOptional()
  @IsEnum(BotLane)
  lane?: BotLane;

  /** Exact reason match (e.g. `CONFIRMING_NO_AGREEMENT`, `COOLDOWN`). */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  reason?: string;

  /**
   * Case-insensitive substring search across `reason`, `symbol`, `order_id`
   * (and stringified payload via `::text` for settings diffs).
   */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  q?: string;

  /** Inclusive lower bound on `at` (epoch ms). Date-picker "from". */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  from?: number;

  /** Inclusive upper bound on `at` (epoch ms). Date-picker "to". */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  to?: number;
}
