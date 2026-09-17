import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';

import { REQUEST_USER_KEY } from '@iam/iam.constants';
import type { ActiveUserData } from '@iam/interfaces/active-user-data.interface';

import schwabConfig from '@schwab/config/schwab.config';

/**
 * Restricts an endpoint to the one account the bot improvement loop trains
 * on, stacked on top of `@Roles(Role.Admin)`.
 *
 * Two independent facts must agree — a DB column and an env-pinned user id —
 * so neither a stray admin row nor a misconfigured env var alone opens the
 * lab. It also closes a gap in the role path: `RolesGuard` reads `role` from
 * the JWT payload rather than a live row, so a revoked admin keeps a usable
 * token until it expires. This guard re-reads config on every request.
 *
 * Fails closed when `SCHWAB_OWNER_USER_ID` is unset.
 */
@Injectable()
export class SchwabOwnerGuard implements CanActivate {
  constructor(
    @Inject(schwabConfig.KEY)
    private readonly config: ConfigType<typeof schwabConfig>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const ownerUserId = this.config.ownerUserId;
    if (!ownerUserId) {
      throw new ForbiddenException(
        'SCHWAB_OWNER_USER_ID is not configured — owner-only endpoints are disabled',
      );
    }

    const user: ActiveUserData | undefined = context
      .switchToHttp()
      .getRequest()[REQUEST_USER_KEY];
    if (user?.sub !== ownerUserId) {
      throw new ForbiddenException(
        'This endpoint is restricted to the bot improvement loop owner',
      );
    }

    return true;
  }
}
