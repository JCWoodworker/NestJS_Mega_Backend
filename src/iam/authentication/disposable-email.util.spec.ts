import { isDisposableEmail } from './disposable-email.util';

describe('isDisposableEmail', () => {
  it('rejects known throwaway providers', () => {
    expect(isDisposableEmail('someone@mailinator.com')).toBe(true);
    expect(isDisposableEmail('x@guerrillamail.com')).toBe(true);
    expect(isDisposableEmail('y@yopmail.com')).toBe(true);
  });

  /** Several of these providers hand out subdomains freely. */
  it('rejects subdomains of throwaway providers', () => {
    expect(isDisposableEmail('someone@foo.mailinator.com')).toBe(true);
  });

  it('is case and whitespace insensitive', () => {
    expect(isDisposableEmail('  Someone@MAILINATOR.com ')).toBe(true);
  });

  /**
   * False positives are the expensive failure here: rejecting a real
   * customer is far worse than accepting a junk row on an app where new
   * accounts cannot do anything until their owner completes Schwab's OAuth.
   */
  it('allows real providers', () => {
    expect(isDisposableEmail('someone@gmail.com')).toBe(false);
    expect(isDisposableEmail('someone@outlook.com')).toBe(false);
    expect(isDisposableEmail('someone@protonmail.com')).toBe(false);
    expect(isDisposableEmail('someone@company.co.uk')).toBe(false);
  });

  it('does not match a provider name appearing elsewhere in the domain', () => {
    // Substring matching would wrongly reject this; the check is
    // exact-or-subdomain.
    expect(isDisposableEmail('someone@mailinator-alternatives.com')).toBe(
      false,
    );
    expect(isDisposableEmail('someone@notmailinator.com')).toBe(false);
  });

  it('handles malformed input without throwing', () => {
    expect(isDisposableEmail('no-at-sign')).toBe(false);
    expect(isDisposableEmail('')).toBe(false);
    expect(isDisposableEmail('trailing@')).toBe(false);
  });
});
