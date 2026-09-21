import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { Role } from '@users/enums/role.enum';
import { UsersService } from '@users/users.service';

import { REQUEST_USER_KEY } from '@iam/iam.constants';
import { ActiveUserData } from '@iam/interfaces/active-user-data.interface';

import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const contextRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!contextRoles) {
      return true;
    }
    const user: ActiveUserData = context.switchToHttp().getRequest()[
      REQUEST_USER_KEY
    ];
    if (!user?.sub) {
      return false;
    }

    /**
     * Re-read the role rather than trusting the JWT claim. Access tokens are
     * long-lived, so a demoted or locked account would otherwise keep admin
     * access until its token expired.
     *
     * This only runs on routes that declare `@Roles`, so the trading and
     * market-data endpoints take no extra query.
     */
    let current: { role: Role; isLocked: boolean };
    try {
      current = await this.usersService.findOneById(user.sub);
    } catch {
      return false;
    }
    if (current.isLocked) {
      return false;
    }

    return contextRoles.some((role) => current.role === role);
  }
}
