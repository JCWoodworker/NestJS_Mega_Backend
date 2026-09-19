/**
 * Decides which Schwab account a P&L read may use, from the caller's own
 * `schwab_tokens` row — never from a leftover hash in the query string.
 *
 * Live Schwab `listAccounts` is a last resort for a connected user whose
 * hash has not been persisted yet. A caller with no token row is
 * "not-connected" and must see empty history, not someone else's ledger.
 */
export type TokenLike = { accountHash: string | null } | null;

export type OwnedAccountDecision =
  | { status: 'none' }
  | { status: 'use'; hash: string }
  | { status: 'live-check'; hash: string }
  | { status: 'resolve-live' };

export function decideOwnedAccountHash(
  token: TokenLike,
  override?: string,
): OwnedAccountDecision {
  if (!token) return { status: 'none' };

  const persisted = token.accountHash?.trim() || null;
  const asked = override?.trim() || '';

  if (asked) {
    if (persisted && asked === persisted) return { status: 'use', hash: persisted };
    return { status: 'live-check', hash: asked };
  }

  if (persisted) return { status: 'use', hash: persisted };
  return { status: 'resolve-live' };
}
