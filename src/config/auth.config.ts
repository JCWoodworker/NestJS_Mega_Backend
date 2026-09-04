import { registerAs } from '@nestjs/config';

function parseBootstrapEmails(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export default registerAs('auth', () => ({
  saltRounds: +process.env.SALT_ROUNDS || 10,
  /** Seeded into `auth_allowed_emails` only when that table is empty. */
  bootstrapAllowedEmails: parseBootstrapEmails(
    process.env.AUTH_BOOTSTRAP_ALLOWED_EMAILS,
  ),
}));
