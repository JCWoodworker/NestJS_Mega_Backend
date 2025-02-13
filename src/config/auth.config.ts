import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  saltRounds: +process.env.SALT_ROUNDS || 10,
}));
