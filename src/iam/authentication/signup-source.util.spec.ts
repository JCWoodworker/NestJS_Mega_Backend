import {
  isSignupSource,
  SIGNUP_SOURCES,
  withSignupSource,
} from './signup-source.util';

describe('signup-source.util', () => {
  it('knows the allowlist', () => {
    expect(isSignupSource('strikedesk')).toBe(true);
    expect(isSignupSource('mycuttingboard')).toBe(true);
    expect(isSignupSource('schwab')).toBe(false);
    expect(isSignupSource(undefined)).toBe(false);
  });

  it('appends a source once', () => {
    expect(withSignupSource([], 'strikedesk')).toEqual(['strikedesk']);
    expect(withSignupSource(['strikedesk'], 'strikedesk')).toEqual([
      'strikedesk',
    ]);
    expect(withSignupSource(['mycuttingboard'], 'strikedesk')).toEqual([
      'mycuttingboard',
      'strikedesk',
    ]);
  });

  it('exports every known RouterModule product slug', () => {
    expect(SIGNUP_SOURCES).toContain('strikedesk');
    expect(SIGNUP_SOURCES).toContain('fantasy-war-room');
  });
});
