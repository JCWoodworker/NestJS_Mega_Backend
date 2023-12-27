export function convertJwtExpirationToLocalDateTime(
  jwtExpiration: number,
): string {
  const expirationInMilliseconds = jwtExpiration * 1000;
  const expirationDate = new Date(expirationInMilliseconds);
  const localDate = expirationDate.toLocaleDateString();
  const localTime = expirationDate.toLocaleTimeString();
  const localDateTime = `${localDate} ${localTime}`;
  return localDateTime;
}
