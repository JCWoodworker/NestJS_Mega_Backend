import { classifySchwabAuthFailure } from './schwab-auth-failure.util';

describe('classifySchwabAuthFailure', () => {
  it('treats a top-level invalid_grant as a dead refresh token', () => {
    expect(
      classifySchwabAuthFailure({
        response: { data: { error: 'invalid_grant' } },
      }),
    ).toBe('dead_refresh');
  });

  /**
   * Prod 2026-09-28: market-data 400s were this shape, not a bare
   * invalid_grant, so the token row was never cleared and Settings stayed
   * "Connected" while the streamer could not log in.
   */
  it('treats the nested unsupported_token_type body from prod as a dead refresh token', () => {
    expect(
      classifySchwabAuthFailure({
        message: 'Request failed with status code 400',
        response: {
          data: {
            error: 'unsupported_token_type',
            error_description:
              '400 Bad Request: "{"error_description":"Refresh token is invalid, expired or revoked","error":"invalid_grant"}"',
          },
        },
      }),
    ).toBe('dead_refresh');
  });

  it('treats a bare unsupported_token_type as a rejected access token', () => {
    expect(
      classifySchwabAuthFailure({
        response: {
          data: {
            error: 'unsupported_token_type',
            error_description: 'token type not allowed',
          },
        },
      }),
    ).toBe('rejected_access');
  });

  it('ignores unrelated request failures', () => {
    expect(
      classifySchwabAuthFailure({
        message: 'timeout of 3000ms exceeded',
      }),
    ).toBeNull();
  });
});
