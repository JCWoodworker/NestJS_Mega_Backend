/**
 * Browser origins permitted for this deployment.
 *
 * One helper so CORS and the OAuth `returnTo` check cannot drift apart. The
 * lists are deliberately not merged: a development origin left configured on a
 * deployed dyno would otherwise become a valid redirect target in prod.
 */
export function getAllowedOrigins(): string[] {
  const environment = process.env.ENVIRONMENT;
  const raw =
    environment === 'development'
      ? process.env.ALLOWED_ORIGINS_DEVELOPMENT
      : environment === 'preprod' || environment === 'prod'
        ? process.env.ALLOWED_ORIGINS
        : undefined;

  return (
    raw
      ?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) ?? []
  );
}
