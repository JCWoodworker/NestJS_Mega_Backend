import {
  schwabIndexQuoteSymbol,
  schwabOptionRoot,
} from './index-symbol.util';

describe('index symbols', () => {
  it('quotes and charts SPX and SPXW as the index', () => {
    expect(schwabIndexQuoteSymbol('SPXW')).toBe('$SPX');
    expect(schwabIndexQuoteSymbol('spx')).toBe('$SPX');
    expect(schwabIndexQuoteSymbol('SPY')).toBe('SPY');
  });

  it('keeps the weekly option root on SPXW', () => {
    expect(schwabOptionRoot('SPX')).toBe('SPXW');
    expect(schwabOptionRoot('SPXW')).toBe('SPXW');
    expect(schwabOptionRoot('SPY')).toBe('SPY');
  });
});
