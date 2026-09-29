import { v2ConfigVersion } from './bot-v2-config.util';

describe('v2ConfigVersion', () => {
  it('separates bar length and underlying from the knob hash', () => {
    const settings = { useScaleOut: false, trailArmPct: 8 };
    const spy = v2ConfigVersion({
      botUnderlying: 'SPY',
      signalBarSeconds: 60,
      settings,
    });
    const fast = v2ConfigVersion({
      botUnderlying: 'SPY',
      signalBarSeconds: 15,
      settings,
    });
    const spxw = v2ConfigVersion({
      botUnderlying: 'SPXW',
      signalBarSeconds: 60,
      settings,
    });
    expect(spy.startsWith('v2|SPY|60|')).toBe(true);
    expect(fast.startsWith('v2|SPY|15|')).toBe(true);
    expect(spxw.startsWith('v2|SPXW|60|')).toBe(true);
    expect(new Set([spy, fast, spxw]).size).toBe(3);
  });
});
