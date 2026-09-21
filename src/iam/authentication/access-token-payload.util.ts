export const ACCESS_TOKEN_PURPOSE = 'access';

/** The only two claims this needs off a verified JWT payload. */
interface TokenClassClaims {
  refreshTokenId?: unknown;
  purpose?: unknown;
}

/**
 * Rejects tokens this backend issued for some other job than authorizing a
 * request.
 *
 * Refresh tokens and email-verification links are signed with the same secret
 * as access tokens, so `verifyAsync` alone accepts all three as a Bearer
 * credential. This keys on claims an access token never carries — a
 * `refreshTokenId`, or a `purpose` naming something else — rather than
 * demanding a positive `purpose: 'access'` marker, because every token already
 * in circulation predates that marker and would start failing mid-session.
 */
export function isNonAccessTokenPayload(payload: TokenClassClaims): boolean {
  if (payload.refreshTokenId !== undefined) {
    return true;
  }
  return (
    payload.purpose !== undefined && payload.purpose !== ACCESS_TOKEN_PURPOSE
  );
}
