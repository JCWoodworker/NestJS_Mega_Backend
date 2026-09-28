export type SchwabAuthFailure = 'dead_refresh' | 'rejected_access';

/**
 * Shown on `stream-status.reason` when live data cannot start because the
 * stored Schwab grant is gone. Refreshing the desk or Resync does not mint
 * a new grant — only Settings → Reconnect Schwab does.
 */
export const SCHWAB_REAUTH_REASON =
  'Schwab authorization expired. Open Settings and use Reconnect Schwab — refreshing the page or Resync will not fix this.';

function collectText(value: unknown, depth = 0): string {
  if (depth > 4 || value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return '';
  return Object.values(value as Record<string, unknown>)
    .map((entry) => collectText(entry, depth + 1))
    .join(' ');
}

/**
 * Schwab signals a spent refresh token in more than one shape. The token
 * endpoint returns `{ error: "invalid_grant" }`. The trader API, when handed
 * an access token from that same dead family, returns
 * `{ error: "unsupported_token_type", error_description: "400 Bad Request:
 * \"{...invalid_grant...}\"" }` — seen in prod 2026-09-28. Matching only the
 * top-level `invalid_grant` left the token row in place, so `/auth/status`
 * stayed `connected: true` while the streamer could not log in.
 */
export function classifySchwabAuthFailure(
  err: unknown,
): SchwabAuthFailure | null {
  const data = (err as { response?: { data?: unknown } })?.response?.data as
    | { error?: unknown }
    | undefined;
  const errorCode = typeof data?.error === 'string' ? data.error : '';
  const message =
    err instanceof Error
      ? err.message
      : typeof (err as { message?: unknown })?.message === 'string'
        ? (err as { message: string }).message
        : '';
  const text = `${errorCode} ${collectText(data)} ${message}`;

  if (
    errorCode === 'invalid_grant' ||
    /refresh token is invalid|invalid_grant|expired or revoked/i.test(text)
  ) {
    return 'dead_refresh';
  }
  if (errorCode === 'unsupported_token_type' || errorCode === 'invalid_token') {
    return 'rejected_access';
  }
  return null;
}
