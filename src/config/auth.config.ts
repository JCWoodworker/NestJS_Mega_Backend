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
  /**
   * The single account promoted to `admin` on boot.
   *
   * Config rather than a literal in code: the address is personal, it is
   * mutable, and preprod/prod hold different `users` rows, so a hardcoded
   * value would be wrong in one environment. There is no in-app path from
   * `basic` to `admin` — sign-up cannot set a role — so this is the only
   * grant mechanism, and `one_admin_only` caps the result at one row.
   */
  adminBootstrapEmail:
    process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase() || null,
}));
