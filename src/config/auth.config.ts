import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  secrets: {
    jwtAccess: process.env.JWT_ACCESS_SECRET,
    jwtRefresh: process.env.JWT_REFRESH_SECRET,
    jwtPasswordReset: process.env.JWT_PASSWORD_RESET_SECRET,
    skipAuth: process.env.SKIP_AUTH_SECRET,
  },
  expirations: {
    jwtAccess: process.env.JWT_ACCESS_EXPIRATION || '15m',
    jwtRefresh: process.env.JWT_REFRESH_EXPIRATION || '7d',
    jwtPasswordReset: process.env.JWT_PASSWORD_RESET_EXPIRATION || '5m',
    authCookie: +process.env.AUTH_COOKIE_EXPIRATION,
    refreshCookie: +process.env.REFRESH_COOKIE_EXPIRATION,
  },
  others: {
    secureCookie: process.env.SECURE_COOKIE || 'true',
    saltRounds: +process.env.SALT_ROUNDS || 10,
  },
}));
