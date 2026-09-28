import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';

import { BotFixtureController } from './bot-fixture.controller';

/**
 * This endpoint is reachable without a user session, because the caller is a
 * throwaway cloud VM holding only a per-run token. The token check is the
 * whole of its access control, so it is tested directly.
 */
describe('BotFixtureController access', () => {
  const fixtureService = { getFixture: jest.fn(async () => ({ sessions: [], incomplete: [] })) };
  const controller = new BotFixtureController(fixtureService as any);

  afterEach(() => {
    delete process.env.BOT_FIXTURE_TOKEN;
    fixtureService.getFixture.mockClear();
  });

  it('serves the fixture to a caller with the right token', async () => {
    process.env.BOT_FIXTURE_TOKEN = 'a-long-enough-secret-token';

    await controller.fixture('Bearer a-long-enough-secret-token', '2026-09-21');

    expect(fixtureService.getFixture).toHaveBeenCalledWith({
      from: '2026-09-21',
      to: undefined,
    });
  });

  it('accepts the token without the Bearer prefix', async () => {
    process.env.BOT_FIXTURE_TOKEN = 'a-long-enough-secret-token';

    await controller.fixture('a-long-enough-secret-token');

    expect(fixtureService.getFixture).toHaveBeenCalled();
  });

  it('refuses a wrong token', async () => {
    process.env.BOT_FIXTURE_TOKEN = 'a-long-enough-secret-token';

    await expect(controller.fixture('Bearer nope')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(fixtureService.getFixture).not.toHaveBeenCalled();
  });

  it('refuses a missing header', async () => {
    process.env.BOT_FIXTURE_TOKEN = 'a-long-enough-secret-token';

    await expect(controller.fixture(undefined)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  /**
   * An app that does not run the improvement loop should expose nothing at
   * all, rather than an endpoint whose only guard is an unset variable.
   */
  it('is disabled when no token is configured', async () => {
    await expect(controller.fixture('Bearer anything')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fixtureService.getFixture).not.toHaveBeenCalled();
  });

  /** timingSafeEqual throws on a length mismatch, which would itself leak. */
  it('refuses a token of the wrong length without throwing', async () => {
    process.env.BOT_FIXTURE_TOKEN = 'a-long-enough-secret-token';

    await expect(controller.fixture('Bearer short')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
