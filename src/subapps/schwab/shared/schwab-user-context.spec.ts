import { InternalServerErrorException } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { delay } from 'rxjs/operators';

import { currentUserId, requireUserId, runAsUser } from './schwab-user-context';
import { SchwabUserContextInterceptor } from './schwab-user-context.interceptor';

function httpContext(user: unknown) {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
}

describe('schwab user context', () => {
  it('exposes the userId inside runAsUser', () => {
    expect(runAsUser('user-1', () => requireUserId())).toBe('user-1');
  });

  it('throws outside any context rather than falling back', () => {
    expect(() => requireUserId()).toThrow(InternalServerErrorException);
    expect(currentUserId()).toBeNull();
  });

  it('survives await boundaries', async () => {
    const seen = await runAsUser('user-1', async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return requireUserId();
    });
    expect(seen).toBe('user-1');
  });

  it('keeps concurrent users isolated', async () => {
    const [a, b] = await Promise.all([
      runAsUser('user-a', async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return requireUserId();
      }),
      runAsUser('user-b', async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return requireUserId();
      }),
    ]);
    expect(a).toBe('user-a');
    expect(b).toBe('user-b');
  });
});

describe('SchwabUserContextInterceptor', () => {
  const interceptor = new SchwabUserContextInterceptor();

  /**
   * The regression this file exists for: subscribing outside `runAsUser`
   * loses the store, so the handler sees no tenant and every Schwab call
   * throws. Asserting through a delayed observable proves the context is
   * carried across the subscription, not just set synchronously.
   */
  it('makes the context visible to a deferred handler', async () => {
    const next = {
      handle: () => of(null).pipe(delay(1)),
    } as any;

    let seen: string | null = null;
    const result = interceptor.intercept(httpContext({ sub: 'user-1' }), {
      handle: () => {
        const inner = next.handle();
        seen = currentUserId();
        return inner;
      },
    } as any);

    await lastValueFrom(result);
    expect(seen).toBe('user-1');
  });

  it('passes through unauthenticated requests without a context', async () => {
    let seen: string | null = 'unset';
    const result = interceptor.intercept(httpContext(undefined), {
      handle: () => {
        seen = currentUserId();
        return of('ok');
      },
    } as any);

    await expect(lastValueFrom(result)).resolves.toBe('ok');
    expect(seen).toBeNull();
  });

  it('leaves non-http contexts alone', async () => {
    const result = interceptor.intercept(
      { getType: () => 'ws' } as any,
      { handle: () => of('ws') } as any,
    );
    await expect(lastValueFrom(result)).resolves.toBe('ws');
  });
});
