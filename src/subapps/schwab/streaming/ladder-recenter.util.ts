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

/**
 * Diffs the current option subscription against the newly centered window,
 * treating pinned symbols as never-unsubscribe.
 *
 * The window re-centers on **spot** while an open position's strike stays
 * where it was, so a move of roughly half the window carries the held
 * contract out of range and the plain diff unsubscribes it. That silently
 * blinds the bot's soft-exit loop — the premium stop and the trailing stop
 * both read the streamed bid — in exactly the situation where a large move
 * makes those exits matter most. Pinning keeps the contract subscribed for
 * as long as the position is open.
 *
 * Pure so the decision is testable without a live streamer, matching
 * `bot-streamer-hold.util.ts`.
 */
export function resolveLadderSubscriptions(params: {
  newWindowSymbols: ReadonlySet<string>;
  currentWindowSymbols: ReadonlySet<string>;
  pinnedSymbols: ReadonlySet<string>;
}): { toSub: string[]; toUnsub: string[] } {
  const { newWindowSymbols, currentWindowSymbols, pinnedSymbols } = params;

  return {
    toUnsub: [...currentWindowSymbols].filter(
      (symbol) => !newWindowSymbols.has(symbol) && !pinnedSymbols.has(symbol),
    ),
    // A pinned symbol that has drifted out of the window is already
    // subscribed and absent from `currentWindowSymbols`, so re-adding it here
    // would send a redundant ADD on every re-center.
    toSub: [...newWindowSymbols].filter(
      (symbol) =>
        !currentWindowSymbols.has(symbol) && !pinnedSymbols.has(symbol),
    ),
  };
}

/**
 * Max symbols per `LEVELONE_OPTIONS` subscription request. Frontend
 * reproduced 3/3 that, of a 32-symbol ladder built via a single request
 * listing all 32 keys, only the trailing 6 (a contiguous slice) ever
 * received ticks - every near-the-money strike, i.e. the ones that matter,
 * went permanently silent with no error response and no subscription
 * churn to explain it (`scripts/tick-coverage.mjs`, 3 runs over ~40min
 * RTH, identical silent set every time). Schwab's Streamer Guide
 * distinguishes `SUBS` ("overwrites all previously subscribed symbols for
 * a service") from `ADD` ("does NOT wipe out previous symbols... OK to use
 * ADD for first subscription command instead of SUBS") - splitting into
 * small chunks and using `ADD` for every chunk (never a bare multi-symbol
 * `SUBS`) avoids relying on Schwab to correctly register a single request
 * with a long `keys` string, regardless of whether the exact failure mode
 * is a request-size limit or something else undocumented on Schwab's side.
 */
export const OPTIONS_SUBSCRIBE_CHUNK_SIZE = 8;

/** Splits `items` into consecutive chunks of at most `chunkSize`, preserving
 * order. Returns `[]` for an empty input rather than `[[]]`. */
export function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) {
    throw new Error(`chunkSize must be positive, got ${chunkSize}`);
  }
  if (items.length === 0) return [];

  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}
