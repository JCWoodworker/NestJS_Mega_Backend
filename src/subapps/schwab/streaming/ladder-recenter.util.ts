/**
 * How many strike increments the spot price must drift away from the
 * current center before the ladder rebuilds. Anything less than 2 lets spot
 * price hovering right at a whole-strike boundary (e.g. SPY bouncing
 * $565.99 <-> $566.01) flip `nearestStrike` back and forth on every tick,
 * which was the actual root cause of a rapid `LEVELONE_OPTIONS`
 * UNSUBS/SUBS churn loop observed live on preprod (streamer logs showed
 * ~300 churn events across a ~13-minute window right after market open) -
 * the ladder was tearing down and re-subscribing the very at-the-money
 * symbols the frontend needs before Schwab ever got a chance to stream a
 * quote for them, which is what made the whole option chain render blank.
 * 3 increments gives real hysteresis while still keeping the ladder
 * reasonably fresh (SPY/QQQ/IWM must move a few dollars before a rebuild).
 */
export const RECENTER_BUFFER_STRIKES = 3;

export function computeNearestStrike(
  spotPrice: number,
  strikeIncrement: number,
): number {
  return Math.round(spotPrice / strikeIncrement) * strikeIncrement;
}

/**
 * Decides whether the option ladder should rebuild around a new center
 * strike. A day rollover (0DTE contracts expiring at today's close) always
 * forces a rebuild regardless of price movement; otherwise the nearest
 * strike must have drifted at least `RECENTER_BUFFER_STRIKES` increments
 * away from the current center.
 */
export function shouldRecenterLadder(params: {
  nearestStrike: number;
  centerStrike: number | null;
  strikeIncrement: number;
  dayRolledOver: boolean;
}): boolean {
  const { nearestStrike, centerStrike, strikeIncrement, dayRolledOver } =
    params;

  if (centerStrike === null) return true;
  if (dayRolledOver) return true;

  return (
    Math.abs(nearestStrike - centerStrike) >=
    strikeIncrement * RECENTER_BUFFER_STRIKES
  );
}
