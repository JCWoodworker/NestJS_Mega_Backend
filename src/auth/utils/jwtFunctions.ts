export function calculateIsJwtWithinExpiry(decodedJwt) {
  const { expiresIn, iat } = decodedJwt;
  // Convert expiresIn duration to milliseconds
  const expiresInMilliseconds = parseJwtDuration(expiresIn);
  // Calculate expiration time based on iat and expiresIn
  const expirationTime = iat * 1000 + expiresInMilliseconds;
  const isTokenWithinExpiry = expirationTime > Date.now();
  if (isTokenWithinExpiry) {
    return true;
  }
  return false;
}

// Function to parse JWT duration like '5m' to milliseconds
export function parseJwtDuration(duration: string): number {
  const durationRegex = /^(\d+)([smhd])$/;
  const match = duration.match(durationRegex);

  if (!match) {
    throw new Error('Invalid duration format in JWT');
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value * 1000; // seconds to milliseconds
    case 'm':
      return value * 60 * 1000; // minutes to milliseconds
    case 'h':
      return value * 60 * 60 * 1000; // hours to milliseconds
    case 'd':
      return value * 24 * 60 * 60 * 1000; // days to milliseconds
    default:
      throw new Error('Invalid duration unit in JWT');
  }
}
