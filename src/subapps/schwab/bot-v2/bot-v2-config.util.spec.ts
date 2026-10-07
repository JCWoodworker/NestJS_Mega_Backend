import { trainerBookKey, v2ConfigVersion } from './bot-v2-config.util';

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

  it('keeps 0DTE in the existing book and splits 1DTE', () => {
    const settings = { useScaleOut: false, expirationMode: '1DTE' };
    const sameDay = v2ConfigVersion({
      botUnderlying: 'SPXW',
      signalBarSeconds: 15,
      expirationMode: '0DTE',
      settings,
    });
    const nextDay = v2ConfigVersion({
      botUnderlying: 'SPXW',
      signalBarSeconds: 15,
      expirationMode: '1DTE',
      settings,
    });
    expect(trainerBookKey(sameDay)).toBe('v2|SPXW|15');
    expect(trainerBookKey(nextDay)).toBe('v2|SPXW|15|1DTE');
    expect(sameDay).not.toBe(nextDay);
  });
});
