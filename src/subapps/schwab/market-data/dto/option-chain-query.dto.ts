import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Query params for the option-chain quote snapshot (frontend contract
 * section 11b). `symbols` lets the frontend filter down to exactly the
 * ladder it already has (matching `ladder-recentered`), so a snapshot never
 * returns quotes outside the current window.
 */
export class OptionChainQueryDto {
  /** Underlying ticker, e.g. "SPY". */
  @IsString()
  symbol: string;

  /** Strikes above + below the money to request from Schwab. Default 16. */
  @IsOptional()
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
}
