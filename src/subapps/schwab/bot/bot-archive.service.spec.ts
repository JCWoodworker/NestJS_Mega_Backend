import { BotArchiveService } from './bot-archive.service';

const SCHWAB_ENV = {
  AWS_S3_BUCKET_NAME_SCHWAB: 'strikedesk-bot-archive',
  AWS_REGION_SCHWAB: 'us-east-2',
  AWS_ACCESS_KEY_SCHWAB: 'key',
  AWS_SECRET_KEY_SCHWAB: 'secret',
};

function repository() {
  return {
    find: jest.fn(async () => []),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(async () => []),
    })),
  };
}

describe('BotArchiveService configuration', () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it('is enabled when the Schwab bucket is fully configured', () => {
    Object.assign(process.env, SCHWAB_ENV);

    expect(new BotArchiveService(repository() as any).enabled).toBe(true);
  });

  /**
   * The bucket lives in a separate business account. Falling back to the
   * personal account's credentials because one variable was missing would
   * write business market data somewhere nobody expects to find it, so a
   * partial configuration disables archiving outright.
   */
  it.each(Object.keys(SCHWAB_ENV))(
    'stays disabled when %s is missing',
    (missing) => {
      Object.assign(process.env, SCHWAB_ENV);
      delete process.env[missing];

      expect(new BotArchiveService(repository() as any).enabled).toBe(false);
    },
  );

  it('never reads the other account credentials', () => {
    process.env.AWS_ACCESS_KEY = 'personal-key';
    process.env.AWS_SECRET_KEY = 'personal-secret';
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_S3_BUCKET_NAME = 'personal-bucket';

    expect(new BotArchiveService(repository() as any).enabled).toBe(false);
  });

  it('archives nothing while disabled', async () => {
    const repo = repository();

    await expect(new BotArchiveService(repo as any).archiveAged()).resolves.toEqual(
      [],
    );
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('returns nothing from the archive while disabled', async () => {
    await expect(
      new BotArchiveService(repository() as any).readSession('2026-01-02'),
    ).resolves.toBeNull();
  });
});
