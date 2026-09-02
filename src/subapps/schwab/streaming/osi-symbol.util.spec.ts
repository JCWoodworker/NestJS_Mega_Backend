import { buildOsiSymbol, parseOsiSymbol } from './osi-symbol.util';

describe('buildOsiSymbol', () => {
  it('builds the doc example SPY $772 call expiring 2026-08-27', () => {
    const symbol = buildOsiSymbol({
      root: 'SPY',
      expiration: new Date(Date.UTC(2026, 7, 27)),
      right: 'C',
      strike: 772,
    });

    expect(symbol).toBe('SPY   260827C00772000');
    expect(symbol).toHaveLength(21);
  });

  it('builds a SPXW put symbol', () => {
    const symbol = buildOsiSymbol({
      root: 'SPXW',
      expiration: new Date(Date.UTC(2026, 7, 27)),
      right: 'P',
      strike: 5800,
    });

    expect(symbol).toBe('SPXW  260827P05800000');
  });

  it('supports half-dollar strikes', () => {
    const symbol = buildOsiSymbol({
      root: 'SPY',
      expiration: new Date(Date.UTC(2026, 7, 27)),
      right: 'C',
      strike: 772.5,
    });

    expect(symbol).toBe('SPY   260827C00772500');
  });
});

describe('parseOsiSymbol', () => {
  it('round-trips a built symbol', () => {
    const built = buildOsiSymbol({
      root: 'SPY',
      expiration: new Date(Date.UTC(2026, 7, 27)),
      right: 'C',
      strike: 772,
    });

    const parsed = parseOsiSymbol(built);

    expect(parsed.root).toBe('SPY');
    expect(parsed.right).toBe('C');
    expect(parsed.strike).toBe(772);
    expect(parsed.expiration.toISOString().slice(0, 10)).toBe('2026-08-27');
  });

  it('throws on malformed input', () => {
    expect(() => parseOsiSymbol('TOO_SHORT')).toThrow();
  });
});
