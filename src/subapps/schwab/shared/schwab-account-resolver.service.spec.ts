import { SchwabAccountResolver } from './schwab-account-resolver.service';
import { runAsUser } from './schwab-user-context';

function build(
  options: {
    accounts?: { hashValue: string }[];
    updateImpl?: () => Promise<unknown>;
  } = {},
) {
  const ordersService = {
    listAccounts: jest
      .fn()
      .mockResolvedValue(options.accounts ?? [{ hashValue: 'HASH-1' }]),
  };
  const tokenRepository = {
    update: jest
      .fn()
      .mockImplementation(options.updateImpl ?? (async () => ({}))),
  };

  const resolver = new SchwabAccountResolver(
    ordersService as never,
    tokenRepository as never,
  );

  return { resolver, ordersService, tokenRepository };
}

describe('SchwabAccountResolver', () => {
  it('resolves and persists the account hash for the calling user', async () => {
    const { resolver, tokenRepository } = build({
      accounts: [{ hashValue: 'HASH-1' }],
    });

    const hash = await runAsUser('user-1', () => resolver.resolve());

    expect(hash).toBe('HASH-1');
    expect(tokenRepository.update).toHaveBeenCalledWith(
      { userId: 'user-1' },
      { accountHash: 'HASH-1' },
    );
  });

  it('serves subsequent calls from the in-memory cache without a second live call', async () => {
    const { resolver, ordersService, tokenRepository } = build();

    await runAsUser('user-1', () => resolver.resolve());
    await runAsUser('user-1', () => resolver.resolve());

    expect(ordersService.listAccounts).toHaveBeenCalledTimes(1);
    expect(tokenRepository.update).toHaveBeenCalledTimes(1);
  });

  it('keeps different users isolated in the cache', async () => {
    const { resolver } = build({ accounts: [{ hashValue: 'HASH-A' }] });

    const a = await runAsUser('user-a', () => resolver.resolve());
    const b = await runAsUser('user-b', () => resolver.resolve());

    expect(a).toBe('HASH-A');
    expect(b).toBe('HASH-A');
  });

  it('throws when the user has no linked accounts', async () => {
    const { resolver } = build({ accounts: [] });

    await expect(runAsUser('user-1', () => resolver.resolve())).rejects.toThrow(
      'No Schwab accounts linked',
    );
  });

  /** A persistence hiccup must not turn a successful resolve into a thrown
   * error — the in-memory cache still works, and the column just stays
   * stale until the next successful write. */
  it('still resolves successfully when persisting the hash fails', async () => {
    const { resolver } = build({
      updateImpl: async () => {
        throw new Error('db unavailable');
      },
    });

    const hash = await runAsUser('user-1', () => resolver.resolve());

    expect(hash).toBe('HASH-1');
  });

  it('invalidate() forces the next resolve to hit Schwab again', async () => {
    const { resolver, ordersService } = build();

    await runAsUser('user-1', () => resolver.resolve());
    resolver.invalidate('user-1');
    await runAsUser('user-1', () => resolver.resolve());

    expect(ordersService.listAccounts).toHaveBeenCalledTimes(2);
  });

  describe('resolveOrNull', () => {
    it('returns null instead of throwing when unlinked', async () => {
      const { resolver } = build({ accounts: [] });

      const result = await runAsUser('user-1', () => resolver.resolveOrNull());

      expect(result).toBeNull();
    });
  });
});
