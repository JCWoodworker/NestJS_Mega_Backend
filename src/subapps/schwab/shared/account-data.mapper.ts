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
   * Start-of-day liquidation value, from Schwab's `initialBalances`. The
   * frontend computes `dayPnl = equity - dayStartEquity`. Both sides prefer
   * liquidation value so an open option is in the account on both ends.
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
   * Unrealized P&L on the lots still open. Prefers Schwab's
   * `longOpenProfitLoss` / `shortOpenProfitLoss` (dollars, already ×100).
   * Otherwise `marketValue - averagePrice * quantity * multiplier`.
   * Deliberately not `currentDayProfitLoss`, which mixes in closed
   * round-trips on the same symbol.
   */
  dayProfitLoss: number;
}

/** Options are quoted per-share; Schwab's marketValue/P&L are already ×100 notional. */
function positionMultiplier(assetType: string): number {
  return assetType === 'OPTION' ? 100 : 1;
}

function finiteNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function firstFinite(...values: unknown[]): number | null {
  for (const value of values) {
    const n = finiteNumber(value);
    if (n != null) return n;
  }
  return null;
}

export function mapAccountBalances(
  schwabAccountResponse: any,
): AccountBalances {
  const balances =
    schwabAccountResponse?.securitiesAccount?.currentBalances ?? {};
  const initialBalances =
    schwabAccountResponse?.securitiesAccount?.initialBalances ?? {};

  return {
    // Cash-account `equity` can be cash only. Liquidation value includes
    // the long option, so Day P&L is not short the position's market value.
    equity: balances.liquidationValue ?? balances.equity ?? 0,
    settledCash: balances.cashAvailableForTrading ?? balances.cashBalance ?? 0,
    optionsBuyingPower: balances.optionBuyingPower ?? balances.buyingPower ?? 0,
    dayStartEquity:
      initialBalances.liquidationValue ??
      initialBalances.accountValue ??
      initialBalances.equity ??
      0,
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
    const multiplier = positionMultiplier(assetType);
    const marketValue = finiteNumber(position.marketValue) ?? 0;
    const short = quantity < 0;
    const quotedAverage =
      firstFinite(
        short
          ? position.taxLotAverageShortPrice
          : position.taxLotAverageLongPrice,
        short ? position.averageShortPrice : position.averageLongPrice,
        position.averagePrice,
        position.averageLongPrice,
        position.averageShortPrice,
      ) ?? 0;
    const openPnl = firstFinite(
      short ? position.shortOpenProfitLoss : position.longOpenProfitLoss,
    );
    const notional = quantity * multiplier;
    let averagePrice = quotedAverage;
    let dayProfitLoss = marketValue - quotedAverage * notional;
    if (openPnl != null) {
      dayProfitLoss = openPnl;
      if (notional !== 0) {
        averagePrice = (marketValue - openPnl) / notional;
      }
    }

    return {
      symbol: position.instrument?.symbol ?? '',
      assetType,
      quantity,
      averagePrice,
      marketValue,
      dayProfitLoss,
    };
  });
}
