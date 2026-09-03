import { computePhase } from './bot-phase.util';
import { BotLane } from './enums/bot-lane.enum';
import { BotMode } from './enums/bot-mode.enum';

const base = {
  mode: BotMode.BOT,
  lane: BotLane.BOT_PAPER,
  lockout: false,
  hasOpenPosition: false,
  transientPhase: null as 'ENTERING' | 'EXITING' | null,
  withinTradeWindow: true,
  inCooldown: false,
};

describe('computePhase', () => {
  it('LOCKOUT takes priority over everything else', () => {
    expect(
      computePhase({ ...base, lockout: true, hasOpenPosition: true }),
    ).toBe('LOCKOUT');
  });

  it('STOPPED when mode is MANUAL', () => {
    expect(computePhase({ ...base, mode: BotMode.MANUAL })).toBe('STOPPED');
  });

  it('STOPPED when no lane selected', () => {
    expect(computePhase({ ...base, lane: null })).toBe('STOPPED');
  });

  it('ENTERING when a walk-limit entry is in flight', () => {
    expect(computePhase({ ...base, transientPhase: 'ENTERING' })).toBe(
      'ENTERING',
    );
  });

  it('EXITING when a marketable-limit exit is in flight', () => {
    expect(
      computePhase({
        ...base,
        hasOpenPosition: true,
        transientPhase: 'EXITING',
      }),
    ).toBe('EXITING');
  });

  it('IN_POSITION when an open bot position exists (no transient action)', () => {
    expect(computePhase({ ...base, hasOpenPosition: true })).toBe(
      'IN_POSITION',
    );
  });

  it('WAITING_WINDOW outside the trade window', () => {
    expect(computePhase({ ...base, withinTradeWindow: false })).toBe(
      'WAITING_WINDOW',
    );
  });

  it('COOLDOWN after a recent trade', () => {
    expect(computePhase({ ...base, inCooldown: true })).toBe('COOLDOWN');
  });

  it('SCANNING when armed, in-window, no position/cooldown', () => {
    expect(computePhase(base)).toBe('SCANNING');
  });

  it('precedence: IN_POSITION beats WAITING_WINDOW/COOLDOWN', () => {
    expect(
      computePhase({
        ...base,
        hasOpenPosition: true,
        withinTradeWindow: false,
        inCooldown: true,
      }),
    ).toBe('IN_POSITION');
  });
});
