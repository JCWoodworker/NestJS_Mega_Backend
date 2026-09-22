import {
  chunkArray,
  computeNearestStrike,
  OPTIONS_SUBSCRIBE_CHUNK_SIZE,
  RECENTER_BUFFER_STRIKES,
  resolveLadderSubscriptions,
  shouldRecenterLadder,
} from './ladder-recenter.util';

/**
 * The ladder follows spot; a held strike does not. Without pinning, a big
 * favourable move unsubscribes the bot's own contract and blinds the premium
 * and trailing stops exactly when they matter.
 */
describe('resolveLadderSubscriptions', () => {
  const held = 'SPY   260921C00769000';

  it('keeps a pinned symbol subscribed after the window moves off it', () => {
    const { toSub, toUnsub } = resolveLadderSubscriptions({
      newWindowSymbols: new Set(['a', 'b']),
      currentWindowSymbols: new Set([held, 'a']),
      pinnedSymbols: new Set([held]),
    });

    expect(toUnsub).not.toContain(held);
    expect(toUnsub).toEqual([]);
    expect(toSub).toEqual(['b']);
  });

  it('unsubscribes an unpinned symbol that left the window', () => {
    const { toUnsub } = resolveLadderSubscriptions({
      newWindowSymbols: new Set(['a']),
      currentWindowSymbols: new Set([held, 'a']),
      pinnedSymbols: new Set(),
    });

    expect(toUnsub).toEqual([held]);
  });

  it('does not re-ADD a pinned symbol the window has drifted back over', () => {
    // Pinning already subscribed it, so a second ADD on every recenter would
    // be churn against the service that silently drops long key lists.
    const { toSub } = resolveLadderSubscriptions({
      newWindowSymbols: new Set([held, 'a']),
      currentWindowSymbols: new Set(['a']),
      pinnedSymbols: new Set([held]),
    });

    expect(toSub).toEqual([]);
  });

  it('is a plain diff when nothing is pinned', () => {
    const { toSub, toUnsub } = resolveLadderSubscriptions({
      newWindowSymbols: new Set(['b', 'c']),
      currentWindowSymbols: new Set(['a', 'b']),
      pinnedSymbols: new Set(),
    });

    expect(toUnsub).toEqual(['a']);
    expect(toSub).toEqual(['c']);
  });
});

describe('computeNearestStrike', () => {
  it('rounds to the nearest whole-dollar strike for a $1 increment', () => {
    expect(computeNearestStrike(565.4, 1)).toBe(565);
    expect(computeNearestStrike(565.6, 1)).toBe(566);
  });

  it('rounds to the nearest $5 strike for an index override increment', () => {
    expect(computeNearestStrike(5802, 5)).toBe(5800);
    expect(computeNearestStrike(5803, 5)).toBe(5805);
  });
});

describe('shouldRecenterLadder', () => {
  it('always recenters when there is no current center (initial subscribe)', () => {
    expect(
      shouldRecenterLadder({
        nearestStrike: 565,
        centerStrike: null,
        strikeIncrement: 1,
        dayRolledOver: false,
      }),
    ).toBe(true);
  });

  it('always recenters on a day rollover regardless of price', () => {
    expect(
      shouldRecenterLadder({
        nearestStrike: 565,
        centerStrike: 565,
        strikeIncrement: 1,
        dayRolledOver: true,
      }),
    ).toBe(true);
  });

  it('does NOT recenter for a single-strike drift (the bug: price hovering at a boundary)', () => {
    // This is the exact scenario that caused live LEVELONE_OPTIONS
    // UNSUBS/SUBS churn on preprod: SPY bouncing $565.99 <-> $566.01 flips
    // nearestStrike between 565 and 566 on every tick.
    expect(
      shouldRecenterLadder({
        nearestStrike: 566,
        centerStrike: 565,
        strikeIncrement: 1,
        dayRolledOver: false,
      }),
    ).toBe(false);
    expect(
      shouldRecenterLadder({
        nearestStrike: 565,
        centerStrike: 566,
        strikeIncrement: 1,
        dayRolledOver: false,
      }),
    ).toBe(false);
  });

  it('does not recenter for a drift just under the buffer', () => {
    const nearestStrike = 565 + (RECENTER_BUFFER_STRIKES - 1);
    expect(
      shouldRecenterLadder({
        nearestStrike,
        centerStrike: 565,
        strikeIncrement: 1,
        dayRolledOver: false,
      }),
    ).toBe(false);
  });

  it('recenters once the drift reaches the buffer threshold', () => {
    const nearestStrike = 565 + RECENTER_BUFFER_STRIKES;
    expect(
      shouldRecenterLadder({
        nearestStrike,
        centerStrike: 565,
        strikeIncrement: 1,
        dayRolledOver: false,
      }),
    ).toBe(true);
  });

  it('scales the buffer by strikeIncrement for wider-increment underlyings', () => {
    const belowThreshold = 5800 + (RECENTER_BUFFER_STRIKES - 1) * 5;
    const atThreshold = 5800 + RECENTER_BUFFER_STRIKES * 5;

    expect(
      shouldRecenterLadder({
        nearestStrike: belowThreshold,
        centerStrike: 5800,
        strikeIncrement: 5,
        dayRolledOver: false,
      }),
    ).toBe(false);
    expect(
      shouldRecenterLadder({
        nearestStrike: atThreshold,
        centerStrike: 5800,
        strikeIncrement: 5,
        dayRolledOver: false,
      }),
    ).toBe(true);
  });
});

describe('chunkArray', () => {
  it('splits a 32-symbol ladder into chunks of the configured size', () => {
    const symbols = Array.from({ length: 32 }, (_, i) => `SYM${i}`);
    const chunks = chunkArray(symbols, OPTIONS_SUBSCRIBE_CHUNK_SIZE);

    expect(chunks.flat()).toEqual(symbols);
    for (const chunk of chunks.slice(0, -1)) {
      expect(chunk.length).toBe(OPTIONS_SUBSCRIBE_CHUNK_SIZE);
    }
    expect(chunks[chunks.length - 1].length).toBeLessThanOrEqual(
      OPTIONS_SUBSCRIBE_CHUNK_SIZE,
    );
  });

  it('returns an empty array for empty input (no request should be sent)', () => {
    expect(chunkArray([], OPTIONS_SUBSCRIBE_CHUNK_SIZE)).toEqual([]);
  });

  it('returns a single chunk when input is smaller than the chunk size', () => {
    expect(chunkArray(['a', 'b'], 8)).toEqual([['a', 'b']]);
  });

  it('handles exact multiples of the chunk size without a trailing empty chunk', () => {
    const symbols = Array.from({ length: 16 }, (_, i) => `SYM${i}`);
    const chunks = chunkArray(symbols, 8);
    expect(chunks.length).toBe(2);
    expect(chunks[0].length).toBe(8);
    expect(chunks[1].length).toBe(8);
  });

  it('throws for a non-positive chunk size', () => {
    expect(() => chunkArray(['a'], 0)).toThrow();
    expect(() => chunkArray(['a'], -1)).toThrow();
  });
});
