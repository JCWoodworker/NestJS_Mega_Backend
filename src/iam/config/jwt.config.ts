import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => {
  const parseWithDefault = (
    value: string | undefined,
    defaultValue: number,
  ): number => {
    const parsed = parseInt(value ?? '', 10);
    return isNaN(parsed) ? defaultValue : parsed;
  };

  return {
    secret: process.env.JWT_SECRET,
    audience: process.env.JWT_TOKEN_AUDIENCE,
    issuer: process.env.JWT_TOKEN_ISSUER,
    // Don't forget to use schema validation here instead of a default value
    // We want to be forced to set environment variables in production
    accessTokenTtl: parseWithDefault(process.env.JWT_ACCESS_TOKEN_TTL, 3600),
    refreshTokenTtl: parseWithDefault(process.env.JWT_REFRESH_TOKEN_TTL, 86400),
  };
});
