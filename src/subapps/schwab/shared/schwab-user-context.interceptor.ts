import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';

import { REQUEST_USER_KEY } from '@iam/iam.constants';
import type { ActiveUserData } from '@iam/interfaces/active-user-data.interface';

import { runAsUser } from './schwab-user-context';

/**
 * Seeds the Schwab tenant context from the authenticated JWT.
 *
 * This is an interceptor rather than middleware on purpose: Nest runs
 * middleware *before* guards, so `request[REQUEST_USER_KEY]` is still unset
 * at that point. Interceptors run after the guard chain, which is the
 * earliest place the user id exists.
 *
 * Unauthenticated routes (the Schwab OAuth callback, sign-in) pass through
 * with no context. They must not need one — `requireUserId()` throws — and
 * the callback instead recovers its userId from the encrypted `state`.
 */
@Injectable()
export class SchwabUserContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const user: ActiveUserData | undefined = context
      .switchToHttp()
      .getRequest()[REQUEST_USER_KEY];
    if (!user?.sub) {
      return next.handle();
    }

    // Subscribing *inside* runAsUser is what carries the store across the
    // RxJS boundary. Returning `next.handle().pipe(...)` would establish the
    // subscription after `run()` has already exited, leaving the handler
    // with no context.
    return new Observable((subscriber) =>
      runAsUser(user.sub, () => next.handle().subscribe(subscriber)),
    );
  }
}
