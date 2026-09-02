import * as https from 'https';

/**
 * Shared HTTPS keep-alive agent for all outbound Schwab API calls. Reusing
 * sockets avoids paying a fresh TLS handshake on every order dispatch, which
 * matters when trade windows are measured in tens of milliseconds.
 */
export const schwabHttpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 50,
  maxFreeSockets: 10,
  scheduling: 'fifo',
});

export const SCHWAB_HTTP_TIMEOUT_MS = 3000;
