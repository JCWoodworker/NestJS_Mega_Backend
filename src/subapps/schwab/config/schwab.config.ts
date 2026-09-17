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
  underlyingSymbol: process.env.SCHWAB_UNDERLYING_SYMBOL || 'SPY',
  /**
   * Per-minute chain snapshots and SPY backfill for the bot analytics loop.
   * Defaults OFF and is enabled on exactly one app (prod) — both apps run the
   * same code, so leaving this on everywhere would produce duplicate, divergent
   * datasets and double the Schwab call volume.
   */
  botRecordingEnabled: process.env.BOT_RECORDING_ENABLED === 'true',
  /**
   * The one account the bot improvement loop trains on. Distinct from the
   * admin *role*: role says who may operate the lab UI, this says whose
   * trading data *is* the lab. Every other user's bot runs normally and
   * contributes nothing to the corpus.
   *
   * Also used to backfill the pre-multi-tenant `schwab_tokens` row.
   */
  ownerUserId: process.env.SCHWAB_OWNER_USER_ID?.trim() || null,
  /**
   * Hard ceiling on concurrent Schwab streamer sessions, one per watching
   * user. Each is a live WebSocket plus timers on a single dyno, so this is
   * the real scaling limit of the current design — better to refuse a new
   * session explicitly than to run the dyno out of memory while other users
   * hold open positions. Raise only after measuring.
   */
  maxStreamerSessions: +process.env.SCHWAB_MAX_STREAMER_SESSIONS || 10,
  /**
   * Minimum spacing per watching user for the account/order pollers.
   *
   * Schwab's documented limit is roughly 120 requests/minute for the whole
   * app, and these two pollers each cost one request per user per round. At
   * the old fixed 4s interval, ~8 concurrent users would consume the entire
   * budget on balance checks and start starving order placement. Spacing
   * scales with watcher count so the total rate stays bounded instead.
   */
  accountPollMinSpacingMs:
    +process.env.SCHWAB_ACCOUNT_POLL_MIN_SPACING_MS || 1500,
}));
