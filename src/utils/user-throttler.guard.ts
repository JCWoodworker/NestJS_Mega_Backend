import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHash } from 'crypto';

import { REQUEST_USER_KEY } from '@iam/iam.constants';
import type { ActiveUserData } from '@iam/interfaces/active-user-data.interface';

/**
 * Rate limits per caller instead of per source IP.
 *
 * Every request to these dynos arrives from the same Heroku router address, so
 * the stock IP tracker puts all clients in one bucket: other traffic could
 * consume the 120 requests/min that the Schwab order endpoints are budgeted.
 * Trusting `X-Forwarded-For` instead would be worse, since the leftmost entry
 * is client-supplied.
 *
 * Falls back to the IP tracker for unauthenticated routes, which keeps the
 * sign-up and sign-in limits working as before.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const user = req[REQUEST_USER_KEY] as ActiveUserData | undefined;
    if (user?.sub) {
      return `user:${user.sub}`;
    }

    // Global guard execution order is not guaranteed to put authentication
    // first, so when `request.user` is not populated yet, key off the bearer
    // token itself. It is stable for the life of a session, which yields the
    // same per-caller bucket. Hashed so raw tokens never become cache keys.
    const [, bearer] = (req.headers?.authorization as string)?.split(' ') ?? [];
    if (bearer) {
      const digest = createHash('sha256').update(bearer).digest('base64url');
      return `token:${digest.slice(0, 32)}`;
    }

    return super.getTracker(req);
  }
}
