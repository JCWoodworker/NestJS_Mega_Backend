import jwtConfig from './jwt.config';

describe('JWT Config', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('should load all JWT configuration values from environment', () => {
    // Set test environment variables
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_TOKEN_AUDIENCE = 'test-audience';
    process.env.JWT_TOKEN_ISSUER = 'test-issuer';
    process.env.JWT_ACCESS_TOKEN_TTL = '7200';
    process.env.JWT_REFRESH_TOKEN_TTL = '172800';

    const config = jwtConfig();

    expect(config).toEqual({
      secret: 'test-secret',
      audience: 'test-audience',
      issuer: 'test-issuer',
      accessTokenTtl: 7200,
      refreshTokenTtl: 172800,
    });
  });

  it('should use default values for TTL when environment variables are not set', () => {
    // Clear specific environment variables
    delete process.env.JWT_ACCESS_TOKEN_TTL;
    delete process.env.JWT_REFRESH_TOKEN_TTL;

    const config = jwtConfig();

    expect(config.accessTokenTtl).toBe(3600); // Default 1 hour
    expect(config.refreshTokenTtl).toBe(86400); // Default 24 hours
  });

  it('should handle invalid TTL values by using defaults', () => {
    process.env.JWT_ACCESS_TOKEN_TTL = 'invalid';
    process.env.JWT_REFRESH_TOKEN_TTL = 'invalid';

    const config = jwtConfig();

    expect(config.accessTokenTtl).toBe(3600);
    expect(config.refreshTokenTtl).toBe(86400);
  });

  it('should allow empty values for optional fields', () => {
    // Clear all JWT-related environment variables
    delete process.env.JWT_SECRET;
    delete process.env.JWT_TOKEN_AUDIENCE;
    delete process.env.JWT_TOKEN_ISSUER;
    delete process.env.JWT_ACCESS_TOKEN_TTL;
    delete process.env.JWT_REFRESH_TOKEN_TTL;

    const config = jwtConfig();

    expect(config).toEqual({
      secret: undefined,
      audience: undefined,
      issuer: undefined,
      accessTokenTtl: 3600,
      refreshTokenTtl: 86400,
    });
  });

  it('should parse numeric strings as integers for TTL values', () => {
    process.env.JWT_ACCESS_TOKEN_TTL = '7200';
    process.env.JWT_REFRESH_TOKEN_TTL = '172800';

    const config = jwtConfig();

    expect(typeof config.accessTokenTtl).toBe('number');
    expect(typeof config.refreshTokenTtl).toBe('number');
    expect(config.accessTokenTtl).toBe(7200);
    expect(config.refreshTokenTtl).toBe(172800);
  });
});
