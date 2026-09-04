import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

import { MARKET_DATA_UNDERLYINGS } from './expirations-query.dto';

/**
 * Query params for the option-chain quote snapshot (frontend contract
 * section 11b / 11c). `symbols` filters to a ladder; `expiration` selects
 * a non-0DTE (or explicit) day — omit for today's 0DTE back-compat.
 */
export class OptionChainQueryDto {
  /** Underlying ticker, e.g. "SPY". */
  @IsString()
  @IsIn([...MARKET_DATA_UNDERLYINGS])
  symbol: string;

  /** Strikes above + below the money to request from Schwab. Default 16. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  strikeCount?: number;

  /**
   * Comma-separated explicit OSI symbol list (matching `ladder-recentered`'s
   * `symbols` array) to filter the response down to. If omitted, every
   * contract Schwab returns for `symbol`/`strikeCount` is included.
   */
  @IsOptional()
  @IsString()
  symbols?: string;

  /**
   * America/New_York calendar expiration `YYYY-MM-DD`. Omit / empty = today
   * (0DTE back-compat). When set, chain is for that day only.
   */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'expiration must be YYYY-MM-DD',
  })
  expiration?: string;
}
