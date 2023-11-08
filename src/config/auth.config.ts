import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  passwordResetSecret: process.env.JWT_PASSWORD_RESET_SECRET,
  skipAuthSecret: process.env.SKIP_AUTH_SECRET,
  saltRounds: +process.env.SALT_ROUNDS || 10,
}));
