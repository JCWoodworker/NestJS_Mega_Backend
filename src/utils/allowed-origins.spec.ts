import { getAllowedOrigins } from './allowed-origins';

describe('getAllowedOrigins', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('ignores the development list in prod', () => {
    process.env.ENVIRONMENT = 'prod';
    process.env.ALLOWED_ORIGINS = 'https://strikedesk.netlify.app';
    process.env.ALLOWED_ORIGINS_DEVELOPMENT = 'http://localhost:3000';

    expect(getAllowedOrigins()).toEqual(['https://strikedesk.netlify.app']);
  });

  it('uses the development list in development', () => {
    process.env.ENVIRONMENT = 'development';
    process.env.ALLOWED_ORIGINS = 'https://strikedesk.netlify.app';
    process.env.ALLOWED_ORIGINS_DEVELOPMENT = 'http://localhost:3000';

    expect(getAllowedOrigins()).toEqual(['http://localhost:3000']);
  });

  it('returns an empty list rather than throwing when unset', () => {
    process.env.ENVIRONMENT = 'development';
    delete process.env.ALLOWED_ORIGINS_DEVELOPMENT;

    expect(getAllowedOrigins()).toEqual([]);
  });

  it('trims whitespace and drops empty entries', () => {
    process.env.ENVIRONMENT = 'preprod';
    process.env.ALLOWED_ORIGINS = 'https://a.app, https://b.app,';

    expect(getAllowedOrigins()).toEqual(['https://a.app', 'https://b.app']);
  });
});
