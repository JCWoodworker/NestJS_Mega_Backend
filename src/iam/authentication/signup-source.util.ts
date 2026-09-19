/**
 * Product / subapp slugs stamped onto `users.signup_sources`.
 *
 * One email can belong to several apps. Strikedesk's admin Users panel
 * filters with `'strikedesk' = ANY(signup_sources)`.
 */
export const SIGNUP_SOURCES = [
  'strikedesk',
  'mycuttingboard',
  'mywoodapp',
  'onlybizlinks',
  'rilw',
  'woodpricing',
  'fantasy-war-room',
] as const;

export type SignupSource = (typeof SIGNUP_SOURCES)[number];

export function isSignupSource(value: unknown): value is SignupSource {
  return (
    typeof value === 'string' &&
    (SIGNUP_SOURCES as readonly string[]).includes(value)
  );
}

/** Append `source` if missing. Returns the same array reference when unchanged. */
export function withSignupSource(
  existing: string[] | null | undefined,
  source: SignupSource | null | undefined,
): string[] {
  const current = Array.isArray(existing) ? [...existing] : [];
  if (!source) return current;
  if (current.includes(source)) return current;
  current.push(source);
  return current;
}
