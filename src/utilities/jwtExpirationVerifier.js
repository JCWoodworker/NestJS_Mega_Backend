export const jwtExpirationVerifier = (decodedExpiration) => {
  try {
    const expirationTime = new Date(decodedExpiration.exp * 1000);
    const now = new Date();

    if (now > expirationTime) {
      throw new UnauthorizedException('Token has expired.');
    }

    return decoded;
  } catch (error) {
    throw new UnauthorizedException('Invalid or expired token');
  }
};
