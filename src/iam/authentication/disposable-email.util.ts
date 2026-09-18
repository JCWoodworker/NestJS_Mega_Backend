/**
 * Rejects throwaway email domains at sign-up.
 *
 * This is a speed bump, not a wall — the list is finite and new throwaway
 * domains appear constantly. Email verification is the real control, and this
 * exists to cover the window before verification ships.
 *
 * Deliberately a static list rather than a live reputation API: sign-up is on
 * the critical path, and a slow or down third party would block legitimate
 * registrations. A missed throwaway domain costs one junk row; a false
 * positive costs a real customer.
 *
 * Kept narrow on purpose. Broad blocklists sweep up real providers and reject
 * paying users, which is a far worse outcome than a few junk accounts on an
 * app where accounts cannot do anything harmful until their owner completes
 * Schwab's own OAuth.
 */
const DISPOSABLE_DOMAINS = new Set<string>([
  '0-mail.com',
  '10minutemail.com',
  '20minutemail.com',
  'discard.email',
  'dispostable.com',
  'fakeinbox.com',
  'getairmail.com',
  'getnada.com',
  'guerrillamail.com',
  'guerrillamail.info',
  'guerrillamail.net',
  'inboxkitten.com',
  'mailbox52.com',
  'maildrop.cc',
  'mailinator.com',
  'mailnesia.com',
  'mintemail.com',
  'moakt.com',
  'mohmal.com',
  'mytemp.email',
  'sharklasers.com',
  'spam4.me',
  'temp-mail.org',
  'tempinbox.com',
  'tempmail.net',
  'tempmailo.com',
  'throwawaymail.com',
  'trashmail.com',
  'yopmail.com',
  'yopmail.net',
]);

/**
 * True when the address uses a known throwaway provider.
 *
 * Also catches subdomains (`foo.mailinator.com`), which several of these
 * providers hand out freely and which would otherwise sail past an
 * exact-match check.
 */
export function isDisposableEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@')[1];
  if (!domain) return false;

  if (DISPOSABLE_DOMAINS.has(domain)) return true;

  return [...DISPOSABLE_DOMAINS].some((blocked) =>
    domain.endsWith(`.${blocked}`),
  );
}
