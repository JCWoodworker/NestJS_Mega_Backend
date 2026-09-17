import { UnauthorizedException } from '@nestjs/common';
import { of } from 'rxjs';

import { SchwabAuthService } from './schwab-auth.service';
import { encryptToken } from './token-encryption.util';

const KEY = 'test-encryption-key';

function tokenRow(userId: string, accessToken: string, expiresInMs: number) {
  return {
    id: `row-${userId}`,
    userId,
    accessToken: encryptToken(accessToken, KEY),
    refreshToken: encryptToken(`refresh-${userId}`, KEY),
    accessTokenExpiresAt: new Date(Date.now() + expiresInMs),
    refreshTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(),
  };
}

function build(rows: Record<string, ReturnType<typeof tokenRow>>) {
  const repository = {
    findOneBy: jest.fn(({ userId }) => Promise.resolve(rows[userId] ?? null)),
    find: jest.fn(() => Promise.resolve(Object.values(rows))),
    save: jest.fn((row) => Promise.resolve(row)),
    delete: jest.fn(() => Promise.resolve({})),
  };
  const httpService = { post: jest.fn() };
  const ordersService = { listAccounts: jest.fn() };
  const config = {
    clientId: 'client',
    clientSecret: 'secret',
    tokenEncryptionKey: KEY,
    tokenUrl: 'https://example.test/token',
    authorizeUrl: 'https://example.test/authorize',
    redirectUri: 'https://example.test/callback',
    redirectSuccessUrl: 'https://example.test/done',
    refreshBufferSeconds: 300,
    accountHash: 'OWNER_ENV_HASH',
    ownerUserId: 'owner',
  };

  const service = new SchwabAuthService(
    repository as any,
    httpService as any,
    ordersService as any,
    config as any,
  );

  return { service, repository, httpService, ordersService };
}

describe('SchwabAuthService multi-tenant isolation', () => {
  it('returns each user their own access token', async () => {
    const { service } = build({
      'user-a': tokenRow('user-a', 'token-a', 60 * 60 * 1000),
      'user-b': tokenRow('user-b', 'token-b', 60 * 60 * 1000),
    });

    await expect(service.getValidAccessToken('user-a')).resolves.toBe(
      'token-a',
    );
    await expect(service.getValidAccessToken('user-b')).resolves.toBe(
      'token-b',
    );
  });

  it('does not serve a cached token to a different user', async () => {
    const { service } = build({
      'user-a': tokenRow('user-a', 'token-a', 60 * 60 * 1000),
      'user-b': tokenRow('user-b', 'token-b', 60 * 60 * 1000),
    });

    // Warm user-a's cache first; a process-wide cache would then hand
    // 'token-a' to user-b.
    await service.getValidAccessToken('user-a');
    await expect(service.getValidAccessToken('user-b')).resolves.toBe(
      'token-b',
    );
  });

  it('throws when the requesting user has not connected Schwab', async () => {
    const { service } = build({
      'user-a': tokenRow('user-a', 'token-a', 60 * 60 * 1000),
    });
    await expect(service.getValidAccessToken('user-b')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  /**
   * The single-flight guard must be keyed by user. A shared promise would
   * resolve both callers to whichever refresh landed first, authenticating
   * one user with the other's Schwab credentials.
   */
  it('keeps the single-flight refresh guard per user', async () => {
    const { service, httpService } = build({
      'user-a': tokenRow('user-a', 'stale-a', -1000),
      'user-b': tokenRow('user-b', 'stale-b', -1000),
    });

    httpService.post.mockImplementation((_url, body: string) => {
      const sent = new URLSearchParams(body).get('refresh_token');
      const user = sent === 'refresh-user-a' ? 'user-a' : 'user-b';
      return of({
        data: {
          access_token: `fresh-${user}`,
          refresh_token: `rotated-${user}`,
          expires_in: 1800,
          token_type: 'Bearer',
        },
      });
    });

    const [a, b] = await Promise.all([
      service.getValidAccessToken('user-a'),
      service.getValidAccessToken('user-b'),
    ]);

    expect(a).toBe('fresh-user-a');
    expect(b).toBe('fresh-user-b');
    expect(httpService.post).toHaveBeenCalledTimes(2);
  });

  it('collapses concurrent refreshes for the same user into one call', async () => {
    const { service, httpService } = build({
      'user-a': tokenRow('user-a', 'stale-a', -1000),
    });

    httpService.post.mockReturnValue(
      of({
        data: {
          access_token: 'fresh-a',
          refresh_token: 'rotated-a',
          expires_in: 1800,
          token_type: 'Bearer',
        },
      }),
    );

    const [first, second] = await Promise.all([
      service.getValidAccessToken('user-a'),
      service.getValidAccessToken('user-a'),
    ]);

    expect(first).toBe('fresh-a');
    expect(second).toBe('fresh-a');
    expect(httpService.post).toHaveBeenCalledTimes(1);
  });

  it('persists the rotated refresh token, not the spent one', async () => {
    const { service, repository, httpService } = build({
      'user-a': tokenRow('user-a', 'stale-a', -1000),
    });

    httpService.post.mockReturnValue(
      of({
        data: {
          access_token: 'fresh-a',
          refresh_token: 'rotated-a',
          expires_in: 1800,
          token_type: 'Bearer',
        },
      }),
    );

    await service.getValidAccessToken('user-a');

    const saved = repository.save.mock.calls[0][0];
    expect(saved.userId).toBe('user-a');
    expect(saved.refreshToken).not.toEqual(encryptToken('refresh-user-a', KEY));
  });

  /**
   * Schwab spends the refresh token we send, so a 200 without a replacement
   * leaves us holding a dead string. It must fail loudly here rather than
   * as an opaque crypto TypeError days later on the next refresh.
   */
  it('fails loudly when Schwab omits the rotated refresh token', async () => {
    const { service, httpService, repository } = build({
      'user-a': tokenRow('user-a', 'stale-a', -1000),
    });

    httpService.post.mockReturnValue(
      of({ data: { access_token: 'fresh-a', expires_in: 1800 } }),
    );

    await expect(service.getValidAccessToken('user-a')).rejects.toThrow(
      /missing access_token or refresh_token/,
    );
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('clears only the offending user on invalid_grant', async () => {
    const { service, repository, httpService } = build({
      'user-a': tokenRow('user-a', 'stale-a', -1000),
      'user-b': tokenRow('user-b', 'token-b', 60 * 60 * 1000),
    });

    httpService.post.mockImplementation(() => {
      throw { response: { data: { error: 'invalid_grant' } } };
    });

    await expect(service.getValidAccessToken('user-a')).rejects.toBeDefined();
    expect(repository.delete).toHaveBeenCalledWith({ id: 'row-user-a' });
    await expect(service.getValidAccessToken('user-b')).resolves.toBe(
      'token-b',
    );
  });
});

describe('SchwabAuthService OAuth state', () => {
  it('round-trips the userId through the encrypted state', async () => {
    const { service, repository, httpService } = build({});

    const url = service.buildAuthorizationUrl('user-a');
    const state = new URL(url).searchParams.get('state');

    httpService.post.mockReturnValue(
      of({
        data: {
          access_token: 'fresh-a',
          refresh_token: 'rotated-a',
          expires_in: 1800,
          token_type: 'Bearer',
        },
      }),
    );

    await service.handleCallback('code', state);

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-a' }),
    );
  });

  it('rejects a state with no userId', async () => {
    const { service } = build({});
    const forged = encryptToken(
      JSON.stringify({ codeVerifier: 'v', exp: Date.now() + 10_000 }),
      KEY,
    );

    await expect(service.handleCallback('code', forged)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe('SchwabAuthService connection status', () => {
  it('reports per-user connection state', async () => {
    const { service, ordersService } = build({
      'user-a': tokenRow('user-a', 'token-a', 60 * 60 * 1000),
    });
    ordersService.listAccounts.mockResolvedValue([{ hashValue: 'HASH_A' }]);

    await expect(service.getConnectionStatus('user-a')).resolves.toEqual(
      expect.objectContaining({ connected: true, accountHash: 'HASH_A' }),
    );
    await expect(service.getConnectionStatus('user-b')).resolves.toEqual({
      connected: false,
      expiresAt: null,
      accountHash: null,
    });
  });

  /**
   * SCHWAB_ACCOUNT_HASH is a single deployment-wide value, so honouring it
   * here would report the owner's brokerage account to every signed-in user.
   */
  it('ignores the deployment-wide account hash env var', async () => {
    const { service, ordersService } = build({
      'user-a': tokenRow('user-a', 'token-a', 60 * 60 * 1000),
    });
    ordersService.listAccounts.mockResolvedValue([{ hashValue: 'HASH_A' }]);

    const status = await service.getConnectionStatus('user-a');
    expect(status.accountHash).toBe('HASH_A');
    expect(status.accountHash).not.toBe('OWNER_ENV_HASH');
  });
});
