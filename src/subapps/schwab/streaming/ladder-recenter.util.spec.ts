import {
  computeNearestStrike,
  RECENTER_BUFFER_STRIKES,
  shouldRecenterLadder,
} from './ladder-recenter.util';

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
