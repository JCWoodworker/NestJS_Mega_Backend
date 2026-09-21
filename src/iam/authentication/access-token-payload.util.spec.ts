import {
  ACCESS_TOKEN_PURPOSE,
  isNonAccessTokenPayload,
} from './access-token-payload.util';

/** Payloads arrive as whatever `verifyAsync` decoded, so build them loosely. */
function payload(claims: Record<string, unknown>) {
  return claims;
}

describe('isNonAccessTokenPayload', () => {
  it('accepts an access token issued before the purpose claim existed', () => {
    expect(
      isNonAccessTokenPayload(
        payload({ sub: 'user-1', email: 'a@b.com', role: 'basic' }),
      ),
    ).toBe(false);
  });

  it('accepts a newly issued access token', () => {
    expect(
      isNonAccessTokenPayload(
        payload({ sub: 'user-1', purpose: ACCESS_TOKEN_PURPOSE }),
      ),
    ).toBe(false);
  });

  it('rejects a refresh token presented as a bearer credential', () => {
    expect(
      isNonAccessTokenPayload(
        payload({ sub: 'user-1', refreshTokenId: 'token-id' }),
      ),
    ).toBe(true);
  });

  it('rejects an email verification token', () => {
    expect(
      isNonAccessTokenPayload(
        payload({ sub: 'user-1', purpose: 'email-verify' }),
      ),
    ).toBe(true);
  });
});
