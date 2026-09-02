# Schwab 0DTE Scalper — Frontend Sync Notes

This file is the shared contract between this backend repo (`nestjs_mega_backend`) and the
separate Expo/React Native frontend project. Paste sections of this into your frontend Cursor
instance as you build each piece. I'll update this file as the backend implementation
progresses, so re-sync periodically (diff against your last copy).

> Source spec: "High-Velocity 0DTE Options Scalping Platform" doc (Schwab Trader API + Expo/NestJS).
> Backend plan: `schwab` subapp under `src/subapps/schwab/` in this repo.

Status: **Backend implemented (Phase 1: auth, streaming gateway, orders).** Sections below are
`CONFIRMED` against the actual code in `src/subapps/schwab/` unless noted otherwise.

---

## 1. Base URLs & mounting

- REST API prefix (global): `api/v1`
- Subapp mount path: `subapps/schwab` (same `RouterModule` pattern as other subapps in this repo)
- So REST calls look like: `POST {API_BASE_URL}/api/v1/subapps/schwab/orders/fast-execute`
- WebSocket (Socket.io) gateway runs on the same NestJS HTTP server, namespace `/options`.

Give the frontend an env config like:

```
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
EXPO_PUBLIC_SOCKET_URL=http://localhost:3000
EXPO_PUBLIC_SOCKET_NAMESPACE=/options
EXPO_PUBLIC_DEEPLINK_SCHEME=myapp://schwab-connected
```

---

## 0. Backend authentication (required — updated)

**This changed from earlier drafts of this doc.** The `/options` socket carries live account
balances and positions, so it now requires a valid JWT from this backend's own auth system (the
same JWT used elsewhere in this mega-backend, **not** a Schwab token). The order REST endpoints
(`/orders/*`) already required this JWT from day one via this backend's global `AuthenticationGuard`
— only the Schwab OAuth endpoints (`/auth/connect`, `/auth/callback`, `/auth/status`) are public.

- Sign in first via this backend's existing auth endpoint (`POST /api/v1/authentication/sign-in`)
  to get `{ accessToken, refreshToken }`.
- Attach `Authorization: Bearer <accessToken>` on every `/orders/*` REST call.
- Attach the same access token to the Socket.io handshake (any of these three work):
  ```ts
  io(`${EXPO_PUBLIC_SOCKET_URL}${EXPO_PUBLIC_SOCKET_NAMESPACE}`, {
    transports: ['websocket'],
    auth: { token: accessToken }, // preferred
  });
  ```
  The gateway also accepts a `token` query param or an `Authorization` header as fallbacks. Sockets
  presenting no token or an invalid/expired one are disconnected immediately on connect.
- Handle token refresh the same way you would for any other REST call in this app (existing
  `POST /api/v1/authentication/refresh-tokens` endpoint) — if the socket gets disconnected due to
  an expired token, refresh and reconnect with the new token.

**Frontend prompt to paste:**

> "Add an `Authorization: Bearer <accessToken>` header to every request in `useOrdersApi.ts`
> (reuse whatever auth/token storage this app already uses for its own backend calls). Pass
> `auth: { token: accessToken }` when constructing the `socket.io-client` instance in
> `hooks/useMarketStream.ts`. On a `disconnect` event with reason `io server disconnect`, attempt a
> token refresh and reconnect once before giving up and showing an auth error."

---

## 2. Schwab OAuth connect flow (public endpoints, server-driven)

The frontend does **not** implement Schwab's OAuth/PKCE flow itself. The backend owns the Schwab
token lifecycle (access/refresh token storage, proactive rotation every 10 minutes when within 5
minutes of expiry). The frontend only needs:

- A "Connect Schwab Account" action that opens `GET {API_BASE_URL}/api/v1/subapps/schwab/auth/connect`
  in a browser/WebView. This redirects to Schwab's consent screen, then Schwab redirects back to
  the backend's `/auth/callback`, which stores tokens and then redirects the browser to an **Expo
  deep link** (`SCHWAB_REDIRECT_SUCCESS_URL` on the backend, e.g. `myapp://schwab-connected`) —
  not a plain HTML page. The Expo app must register this URL scheme so it regains focus
  automatically once the browser/WebView redirects to it.
- These three OAuth endpoints (`/auth/connect`, `/auth/callback`, `/auth/status`) are public
  (no backend JWT required) since Schwab's own redirect can't carry your app's bearer token.

**Frontend prompt to paste:**

> "Register a deep link scheme in `app.json` (e.g. `myapp://`) and add a linking config so
> `myapp://schwab-connected` is handled as a route. Add a 'Connect Schwab' button on the settings
> screen that opens `${EXPO_PUBLIC_API_BASE_URL}/api/v1/subapps/schwab/auth/connect` via
> `expo-web-browser`'s `openAuthSessionAsync` (not a plain browser tab — this API is built for
> OAuth flows that end in a deep-link redirect and will auto-close the browser/WebView when
> `myapp://schwab-connected` is hit). On return, show a 'Connected' badge and optionally confirm by
> polling `GET /api/v1/subapps/schwab/auth/status` once — returns `{ connected: boolean, expiresAt: string | null }`."

---

## 3. Order execution endpoints (REST)

Mirrors the doc's `OrdersController`. All three return fast, un-reviewed order dispatch — no
confirmation step. **Requires `Authorization: Bearer <accessToken>`** (see section 0).

### `POST /api/v1/subapps/schwab/orders/fast-execute`

Request body (`FastOrderDto`):

```ts
{
  accountHash: string;
  symbol: string;            // 21-char OSI symbol, e.g. "SPY   260827C00772000"
  instruction: 'BUY_TO_OPEN' | 'SELL_TO_CLOSE' | 'SELL_TO_OPEN' | 'BUY_TO_CLOSE';
  quantity: number;
  orderType: 'LIMIT' | 'MARKET';
  price?: number;             // required if orderType === 'LIMIT'
  slippageTolerance?: number; // e.g. 0.05 — converts LIMIT into a marketable limit
}
```

Response:

```ts
{
  status: 'SUBMITTED';
  statusCode: number;
  latencyMs: number;
  orderLocation: string | null; // Location header from Schwab's order response
}
```

### `POST /api/v1/subapps/schwab/orders/flatten`

```ts
// request
{ accountHash: string; symbol: string; quantity: number }
// response: same shape as fast-execute, always MARKET SELL_TO_CLOSE
```

### `POST /api/v1/subapps/schwab/orders/reverse`

```ts
// request
{ accountHash: string; closeSymbol: string; openSymbol: string; quantity: number }
// response
{ status: 'REVERSED'; closed: <fast-execute response>; opened: <fast-execute response> }
```

**Frontend prompt to paste:**

> "Wire `QuickActionBtns.tsx` and `FastOrderBar.tsx` to a `useOrdersApi.ts` hook using TanStack
> Query mutations against `${EXPO_PUBLIC_API_BASE_URL}/api/v1/subapps/schwab/orders/{fast-execute|flatten|reverse}`.
> Use the request/response shapes documented in `schwab-frontend-notes.md` section 3. On success,
> fire the audio/haptic feedback hooks; on failure, surface `error.message` inline near the button
> without a blocking modal."

---

## 4. Real-time streaming (Socket.io, not raw Schwab WebSocket)

The frontend **never connects directly to Schwab's streamer**. It connects to this backend's
Socket.io gateway at namespace `/options`, which relays throttled (50ms) ticks after the backend
has already done the Schwab WS login/heartbeat/re-centering work.

Connect (now requires this backend's JWT — see section 0):

```ts
import { io } from 'socket.io-client';
const socket = io(`${EXPO_PUBLIC_SOCKET_URL}${EXPO_PUBLIC_SOCKET_NAMESPACE}`, {
  transports: ['websocket'],
  auth: { token: accessToken },
});
```

### Server → client events

- `underlying-price` — `{ symbol: 'SPY', price: number, timestamp: number }`
- `option-ticks` — batched array of raw field-keyed tick objects, matching Schwab's
  `LEVELONE_OPTIONS` field map so the existing `useMarketStore.updateTicks` shape from the doc
  works unchanged:

```ts
type OptionTickRaw = {
  '0': string;  // symbol (OSI)
  '1': number;  // bid
  '2': number;  // ask
  '3': number;  // last
  '4'?: number; // bid size
  '5'?: number; // ask size
  '8'?: number; // total volume
  '9'?: number; // open interest
  '16'?: number; // delta
  '17'?: number; // gamma
};
// event payload: OptionTickRaw[]
```

- `ladder-recentered` — `{ centerStrike: number, symbols: string[] }` — fired whenever the backend
  re-centers the 16-strike window, so the frontend can update its local ladder without waiting for
  the next tick batch.
- `stream-status` — `{ connected: boolean, lastFrameAt: number | null }` — reflects the backend's
  own connection health to Schwab's streamer (heartbeat watchdog state), useful for showing a
  "stale data" banner in the UI.
- `account-snapshot` — **DECIDED**: delivered over this same socket, not REST polling. Backend's
  `AccountSnapshotService` polls Schwab's account REST endpoint on an interval (~3-5s) and
  re-broadcasts here:

```ts
{ equity: number; settledCash: number; optionsBuyingPower: number; asOf: number /* epoch ms */ }
```

### Client → server events

- `subscribe-underlying` — `{ symbol: 'SPY' | 'SPX' }` — tells backend which underlying to stream/re-center around.

**Frontend prompt to paste:**

> "Implement `hooks/useMarketStream.ts` using `socket.io-client` connected to
> `${EXPO_PUBLIC_SOCKET_URL}${EXPO_PUBLIC_SOCKET_NAMESPACE}`. On `option-ticks`, call
> `useMarketStore.updateTicks(payload)` (payload is already keyed by Schwab field-map indices, no
> transform needed). On `underlying-price`, call `setUnderlyingPrice`. On `stream-status` with
> `connected: false`, show a non-blocking 'stale data' banner. Emit `subscribe-underlying` on mount
> with `{ symbol: 'SPY' }`."

---

## 5. OSI option symbol format (shared convention)

21-character OCC/OSI format used everywhere (order payloads, streaming subscription keys, tick
`symbol` fields):

```
SPY   260827C00772000
```

- Root symbol, space-padded to 6 chars (`SPY   `, `SPXW  `)
- `YYMMDD` expiration
- `C` or `P`
- Strike price × 1000, zero-padded to 8 digits

If the frontend needs to build/parse these locally (e.g. to label ladder rows or construct a
symbol before calling `fast-execute`), use the same padding rules above. Reference implementation:
`src/subapps/schwab/streaming/osi-symbol.util.ts` (`buildOsiSymbol`/`parseOsiSymbol`), unit tested
in the sibling `.spec.ts` file if you want to verify a port against the same cases.

---

## 6. Pre-flight affordability check (client-side, mirrors backend rules)

Per the doc: the frontend should compute this **locally** for instant UI feedback (no round trip).
**DECIDED**: the account snapshot arrives via the `account-snapshot` socket event (section 4), not
a REST endpoint — so this reuses the same `useMarketStream`/socket connection, no separate polling
loop needed. Store the latest snapshot in `useAccountStore.ts`.

Formula (doc's pre-flight engine): given quantity `q`, limit price `p`, equity `E`, settled cash
`C`, buying power `B`:

```
tradeCost = q * p * 100
affordable = tradeCost <= B && (E >= 2000 || tradeCost <= C)
```

**Frontend prompt to paste:**

> "Add `account-snapshot` handling to `hooks/useMarketStream.ts` (same socket connection as
> `option-ticks`): on receipt, update `useAccountStore.ts` with
> `{ equity, settledCash, optionsBuyingPower, asOf }`. In `FastOrderBar.tsx`, read that store and
> compute `tradeCost = qty * price * 100` and
> `affordable = tradeCost <= optionsBuyingPower && (equity >= 2000 || tradeCost <= settledCash)`
> exactly as documented in `schwab-frontend-notes.md` section 6. Disable the BUY button and show
> the capital deficit inline when `affordable` is false — never rely on the backend rejecting the
> order. If `asOf` is older than ~10s, show a subtle 'stale balance' hint."

---

## 7. Sync checklist

The backend for Phase 1 (auth, streaming gateway, orders) is implemented and this file is
`CONFIRMED` against it. If I make further backend changes (e.g. adding multi-account support,
changing field names after live-testing against Schwab), I'll call out the diff here and tell you
which section to re-paste.

1. Copy this whole file into your frontend Cursor instance now — it reflects the real implementation.
2. Pay special attention to section 0 (new): both REST orders and the socket now require this
   backend's own JWT, not just a "connected Schwab" state.
3. Before going live with real money, validate the streamer field mappings and account-balance
   field names (`equity`/`settledCash`/`optionsBuyingPower`) against a real Schwab account response —
   these were built from the public Schwab doc spec and haven't been exercised against Schwab's
   live API yet.

---

## Decisions log

- **OAuth success redirect**: Expo deep link (`myapp://schwab-connected`), not a plain HTML page. Register this scheme in `app.json` and handle it with `expo-web-browser`'s `openAuthSessionAsync`.
- **Account snapshot delivery**: streamed over the `/options` socket as an `account-snapshot` event, not REST polling. One socket connection covers ticks, underlying price, and balances.
- **Socket authentication (added after initial build)**: the `/options` gateway broadcasts account balances/positions, so it now requires this backend's own JWT (same one used for REST) via the Socket.io handshake `auth: { token }`. Unauthenticated or invalid-token sockets are disconnected immediately. This was not in the original plan — added before deployment once we flagged it as a security gap.
