export interface StreamerHoldDiff {
  toAcquire: string[];
  toRelease: string[];
}

/**
 * Diffs the set of users whose bot is currently armed against the set
 * already holding a background streamer session.
 *
 * Pulled out as a pure function so this diff — the actual decision of who
 * to acquire/release — is testable without constructing `BotEngineService`
 * or its ten-odd injected dependencies. The caller performs the actual
 * `acquire`/`release` calls and updates its own held-set from the result.
 */
export function diffStreamerHolds(
  armedUserIds: readonly string[],
  currentlyHeldUserIds: ReadonlySet<string>,
): StreamerHoldDiff {
  const armed = new Set(armedUserIds);
  return {
    toAcquire: armedUserIds.filter((userId) => !currentlyHeldUserIds.has(userId)),
    toRelease: [...currentlyHeldUserIds].filter((userId) => !armed.has(userId)),
  };
}
