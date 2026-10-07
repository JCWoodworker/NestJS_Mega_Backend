import { resolveTrainerExpiration } from './bot-v2-expiration.util';

describe('resolveTrainerExpiration', () => {
  const listed = ['2026-10-07', '2026-10-08', '2026-10-09'];

  it('stays on today for 0DTE and when the mode is unset', () => {
    expect(resolveTrainerExpiration('0DTE', '2026-10-07', listed)).toBe('2026-10-07');
    expect(resolveTrainerExpiration(undefined, '2026-10-07', listed)).toBe('2026-10-07');
  });

  it('picks the next listed day for 1DTE', () => {
    expect(resolveTrainerExpiration('1DTE', '2026-10-07', listed)).toBe('2026-10-08');
  });

  it('returns null when nothing is listed after today', () => {
    expect(resolveTrainerExpiration('1DTE', '2026-10-09', listed)).toBeNull();
  });
});
