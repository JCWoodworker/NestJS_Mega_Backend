import { registerAs } from '@nestjs/config';

export default registerAs('schwab', () => ({
  clientId: process.env.SCHWAB_CLIENT_ID,
  clientSecret: process.env.SCHWAB_CLIENT_SECRET,
  redirectUri: process.env.SCHWAB_REDIRECT_URI,
  redirectSuccessUrl: process.env.SCHWAB_REDIRECT_SUCCESS_URL,
  accountHash: process.env.SCHWAB_ACCOUNT_HASH,
  tokenEncryptionKey: process.env.SCHWAB_TOKEN_ENCRYPTION_KEY,
  apiBaseUrl: process.env.SCHWAB_API_BASE_URL || 'https://api.schwabapi.com',
  authorizeUrl:
    process.env.SCHWAB_AUTHORIZE_URL ||
    'https://api.schwabapi.com/v1/oauth/authorize',
  tokenUrl:
    process.env.SCHWAB_TOKEN_URL || 'https://api.schwabapi.com/v1/oauth/token',
  accessTokenTtlSeconds: 30 * 60,
  refreshBufferSeconds: 5 * 60,
  heartbeatTimeoutMs: 30 * 1000,
  tickEmitThrottleMs: 50,
  accountSnapshotPollMs: +process.env.SCHWAB_ACCOUNT_SNAPSHOT_POLL_MS || 4000,
  orderUpdatePollMs: +process.env.SCHWAB_ORDER_UPDATE_POLL_MS || 3000,
  strikeLadderSize: 16,
}));
