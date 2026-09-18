import { InternalServerErrorException } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

interface SchwabUserContext {
  userId: string;
}

const storage = new AsyncLocalStorage<SchwabUserContext>();

/**
 * Runs `fn` with `userId` as the ambient Schwab tenant.
 *
 * Every Schwab API call resolves its bearer token through the Axios
 * interceptor in `SchwabHttpModule`, which has no request object to read
 * from. Rather than thread a userId through every service signature down to
 * the HTTP layer, the request interceptor seeds this store and the token
 * lookup reads it back out.
 *
 * Background work (the refresh cron, streamer sessions, the bot heartbeat)
 * has no incoming request, so it must wrap each per-user unit of work in
 * this explicitly.
 */
export function runAsUser<T>(userId: string, fn: () => T): T {
  return storage.run({ userId }, fn);
}

/**
 * Throws when no tenant is in scope rather than falling back to a default.
 *
 * A silent fallback here is the worst available failure: it would resolve one
 * user's request against whichever Schwab token happened to be reachable,
 * placing real orders on the wrong brokerage account. Losing the context is a
 * bug in the caller, so it fails loudly and immediately.
 */
export function requireUserId(): string {
  const userId = storage.getStore()?.userId;
  if (!userId) {
    throw new InternalServerErrorException(
      'No Schwab user context in scope — background callers must wrap work in runAsUser()',
    );
  }
  return userId;
}

/** Non-throwing peek, for logging and for guards that tolerate absence. */
export function currentUserId(): string | null {
  return storage.getStore()?.userId ?? null;
}

/**
 * Sets the tenant for the rest of the current execution context, without
 * wrapping a callback.
 *
 * Intended for tests and for synchronous entry points that cannot easily
 * nest inside `runAsUser`. Prefer `runAsUser` in application code: it scopes
 * the context to a known boundary, whereas this leaks into everything that
 * follows on the same async resource.
 */
export function enterUserContext(userId: string): void {
  storage.enterWith({ userId });
}
