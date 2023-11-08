import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  passwordResetSecret: process.env.JWT_PASSWORD_RESET_SECRET,
  skipAuthSecret: process.env.SKIP_AUTH_SECRET,
  jwtAccessExpiration: process.env.JWT_ACCESS_EXPIRATION || '15m',
  jwtRefreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '7d',
  jwtPasswordResetExpiration: process.env.JWT_PASSWORD_RESET_EXPIRATION || '5m',
  saltRounds: +process.env.SALT_ROUNDS || 10,
}));
