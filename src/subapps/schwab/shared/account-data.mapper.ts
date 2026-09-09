/**
 * Normalizes Schwab's `/trader/v1/accounts/{accountHash}?fields=positions`
 * response into the shapes this backend hands to the frontend (both over
 * the `account-snapshot` socket event and the on-demand REST endpoints).
 * Field names vary between cash and margin accounts on Schwab's API, so
 * every field falls back across the documented aliases rather than
 * assuming one shape.
 */

export interface AccountBalances {
  equity: number;
  settledCash: number;
  optionsBuyingPower: number;
  /**
   * Start-of-day account value, from Schwab's `initialBalances` (distinct
   * from `currentBalances`, which `equity` above reads). Lets the frontend
   * compute `dayPnl = equity - dayStartEquity` - covering realized *and*
   * unrealized P&L and surviving reloads - instead of only summing
   * `positions[].dayProfitLoss`, which drops a closed trade's P&L the
   * moment it leaves the positions array (frontend contract open item 13 /
   * section 12).
   */
  dayStartEquity: number;
}

export interface PositionSnapshot {
  /** 21-char OSI symbol for options, plain ticker for equities. */
  symbol: string;
  assetType: string;
  /** Positive = net long, negative = net short. */
  quantity: number;
  averagePrice: number;
  marketValue: number;
  /**
   * Unrealized P&L on the *currently open* quantity: `marketValue -
   * averagePrice * quantity * multiplier`. Deliberately NOT Schwab's
   * `currentDayProfitLoss` - that field is the day's realized *and*
   * unrealized result for the symbol, so it swings on intraday round-trips
   * (scale in/out) that never touch the remaining open lot's cost basis,
   * producing a number that doesn't reconcile with "I bought at X, mark is
   * X, why isn't this ~$0" (frontend contract 2026-09-09 bug report). The
   * account bar's "Day P&L" (`equity - dayStartEquity`, section 12) already
   * covers realized + unrealized honestly at the account level.
   */
  dayProfitLoss: number;
}

/** Options are quoted per-share; Schwab's marketValue/P&L are already ×100 notional. */
function positionMultiplier(assetType: string): number {
  return assetType === 'OPTION' ? 100 : 1;
}

export function mapAccountBalances(
  schwabAccountResponse: any,
): AccountBalances {
  const balances =
    schwabAccountResponse?.securitiesAccount?.currentBalances ?? {};
  const initialBalances =
    schwabAccountResponse?.securitiesAccount?.initialBalances ?? {};

  return {
    equity: balances.equity ?? balances.liquidationValue ?? 0,
    settledCash: balances.cashAvailableForTrading ?? balances.cashBalance ?? 0,
    optionsBuyingPower: balances.optionBuyingPower ?? balances.buyingPower ?? 0,
    dayStartEquity:
      initialBalances.liquidationValue ?? initialBalances.accountValue ?? 0,
  };
}

export function mapAccountPositions(
  schwabAccountResponse: any,
): PositionSnapshot[] {
  const positions = schwabAccountResponse?.securitiesAccount?.positions ?? [];

  return positions.map((position: any) => {
    const assetType = position.instrument?.assetType ?? 'UNKNOWN';
    const quantity =
      (position.longQuantity ?? 0) - (position.shortQuantity ?? 0);
    const averagePrice =
      position.averagePrice ??
      position.averageLongPrice ??
      position.averageShortPrice ??
      0;
    const marketValue = position.marketValue ?? 0;
    const costBasis = averagePrice * quantity * positionMultiplier(assetType);

    return {
      symbol: position.instrument?.symbol ?? '',
      assetType,
      quantity,
      averagePrice,
      marketValue,
      dayProfitLoss: marketValue - costBasis,
    };
  });
}
