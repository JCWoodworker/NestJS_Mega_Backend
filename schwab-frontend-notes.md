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

## Master build prompt (paste this whole block into your frontend Cursor instance first)

> I'm building the Expo/React Native frontend for a "High-Velocity 0DTE Options Scalping
> Platform" against an already-implemented NestJS backend. I've copied the file
> `schwab-frontend-notes.md` into this project root — read it in full before doing anything, it's
> the authoritative contract for every endpoint, event, and payload shape below. Do NOT invent
> different field names, routes, or auth flows; if something is ambiguous, ask me rather than
> guessing.
>
> Build these in order, one at a time, confirming each works before moving to the next:
>
> **1. Env config.** Add the env vars from `schwab-frontend-notes.md` section 1 to `.env` /
> `app.config.ts`. Use the **preprod** values for now
> (`https://nestjs-mega-backend-preprod-420ae4c0c109.herokuapp.com`) — that's the environment we're
> using for first live tests. Leave `EXPO_PUBLIC_DEEPLINK_SCHEME` as `myapp://schwab-connected`
> unless you pick a different scheme name for this app (tell me what you pick — I need to set the
> matching `SCHWAB_REDIRECT_SUCCESS_URL` on the backend).
>
> **2. Backend auth (this app's own JWT, not Schwab's).** Implement/confirm sign-in against
> `POST /api/v1/authentication/sign-in` and token refresh against
> `POST /api/v1/authentication/refresh-tokens`. Every `/orders/*` REST call and the `/options`
> socket handshake need `Authorization: Bearer <accessToken>` — see section 0 for the exact
> pattern and the `useOrdersApi.ts` / `useMarketStream.ts` wiring instructions.
>
> **3. Schwab "Connect" flow.** Register the `myapp://` deep link scheme in `app.json`, add a
> "Connect Schwab" button that opens `/api/v1/subapps/schwab/auth/connect` via
> `expo-web-browser`'s `openAuthSessionAsync`, and show a connected/disconnected badge driven by
> `GET /auth/status`. Full instructions and exact prompt text in section 2.
>
> **4. Real-time market data.** Implement `hooks/useMarketStream.ts` per section 4 — connect to the
> `/options` Socket.io namespace with the JWT, handle `option-ticks`, `underlying-price`,
> `ladder-recentered`, and `stream-status`, emit `subscribe-underlying` on mount.
>
> **5. Account snapshot + affordability.** Add `account-snapshot` handling to the same socket
> (section 4/6) into `useAccountStore.ts`, then implement the local affordability formula in
> `FastOrderBar.tsx` exactly as documented in section 6 — this must be computed client-side for
> instant feedback, never a round trip to the backend.
>
> **6. Order execution.** Wire `QuickActionBtns.tsx` and `FastOrderBar.tsx` to
> `useOrdersApi.ts` hitting `fast-execute` / `flatten` / `reverse` per section 3, using the OSI
> symbol format from section 5 wherever a symbol needs to be built or parsed locally.
>
> After each step, tell me what you built and any assumptions you made so I can confirm against
> the actual backend behavior — some of this (streamer field names, account-balance field names)
> hasn't been exercised against Schwab's live API yet, so we may need to adjust field mappings once
> we do a real end-to-end test.

**Open decision I still need from you (the human) before this is fully wired:** what Expo deep
link scheme/path do you want for the post-connect redirect? Default assumption above is
`myapp://schwab-connected` — once you (or the frontend AI) pick the real one, tell me and I'll set
`SCHWAB_REDIRECT_SUCCESS_URL` to match on both preprod and prod.

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

**Real deployed URLs (live now, verified working):**

```
# Preprod
EXPO_PUBLIC_API_BASE_URL=https://nestjs-mega-backend-preprod-420ae4c0c109.herokuapp.com
EXPO_PUBLIC_SOCKET_URL=https://nestjs-mega-backend-preprod-420ae4c0c109.herokuapp.com

# Prod
EXPO_PUBLIC_API_BASE_URL=https://nestjs-mega-backend-prod-893a099fba68.herokuapp.com
EXPO_PUBLIC_SOCKET_URL=https://nestjs-mega-backend-prod-893a099fba68.herokuapp.com
```

`EXPO_PUBLIC_SOCKET_NAMESPACE` stays `/options` in both. Point the Expo app at **preprod** while
testing — that's the environment we're using for the first live Schwab OAuth/order tests.

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
- **Web client support (added):** if you're testing via Expo web / a plain browser tab (deep links
  don't work there), pass `?returnTo=<url>` on `/auth/connect`, e.g.
  `/api/v1/subapps/schwab/auth/connect?returnTo=http://localhost:8081/schwab-connected`. The
  backend redirects here instead of the Expo deep link on success. `returnTo` must be either an
  `exp://` / `myapp://` URL, or an origin already present in this backend's `ALLOWED_ORIGINS` /
  `ALLOWED_ORIGINS_DEVELOPMENT` CORS allowlist (preprod currently includes
  `http://localhost:8081` and `http://localhost:19006` for Expo web dev servers) — anything else is
  rejected with a 401 to prevent this becoming an open redirect. Omit it entirely for the native
  deep-link flow, unchanged from above.
- `GET /auth/status` now also returns `accountHash: string | null` (see section 3.5) so you don't
  have to hardcode it.

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

**Error response shape (all endpoints, no custom exception filter):** standard Nest default —

```ts
{ statusCode: number; message: string | string[]; error: string }
```

`message` is a single string for most thrown errors (e.g. Schwab order rejections surface as
`{ statusCode: 400, message: "<schwab's error text>", error: "Bad Request" }`), but is a **string
array** for DTO validation failures (e.g. missing `accountHash`), since that's `class-validator`'s
default format. Don't assume `message` is always a string.

**Rate limiting (added):** this backend has a global default guard of 10 requests/60s per IP
(shared across all subapps in this mega-backend). `OrdersController` overrides this to **120
requests/60s per IP**, matching the Order Limit approved for this app in the Schwab Developer
Portal — Schwab enforces its own 120/min-per-account cap upstream regardless, so you shouldn't hit
429s from us before Schwab itself would reject the request. If you do get a 429, it's a real
`ThrottlerException` (`{ statusCode: 429, message: "ThrottlerException: Too Many Requests" }`), not
an accidental backend limit.

### `GET /api/v1/subapps/schwab/orders/accounts`

Lists Schwab account numbers linked to this app + their `hashValue` (the opaque `accountHash`
every order/position endpoint expects) — so you don't have to hardcode
`SCHWAB_ACCOUNT_HASH`/ask the user to find it themselves.

```ts
// response
Array<{ accountNumber: string; hashValue: string }>
```

### `GET /api/v1/subapps/schwab/orders/positions?accountHash=<hash>`

On-demand fetch for the Position HUD (e.g. initial load before the socket connects, or a manual
refresh button). The same shape is also pushed proactively every ~4s via the `account-snapshot`
socket event (section 4) — prefer that for live updates, use this endpoint only for one-off fetches.

```ts
// response
Array<{
  symbol: string;       // OSI for options, plain ticker for equities
  assetType: string;    // e.g. "OPTION", "EQUITY"
  quantity: number;     // positive = net long, negative = net short
  averagePrice: number;
  marketValue: number;
  dayProfitLoss: number;
}>
```

**Frontend prompt to paste:**

> "Wire `QuickActionBtns.tsx` and `FastOrderBar.tsx` to a `useOrdersApi.ts` hook using TanStack
> Query mutations against `${EXPO_PUBLIC_API_BASE_URL}/api/v1/subapps/schwab/orders/{fast-execute|flatten|reverse}`.
> Use the request/response shapes documented in `schwab-frontend-notes.md` section 3. On success,
> fire the audio/haptic feedback hooks; on failure, check whether `error.message` is a string or
> array (DTO validation errors are arrays) before rendering it, and surface it inline near the
> button without a blocking modal. Build the Position HUD's initial state from
> `GET /orders/positions?accountHash=<hash>` (fetch `accountHash` from `GET /auth/status` first),
> then let live updates come from the `account-snapshot` socket event instead of polling this
> endpoint."

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
  `AccountSnapshotService` polls Schwab's account REST endpoint on an interval (~4s) and
  re-broadcasts here. **Now includes `positions`** (added, was missing from earlier drafts of this
  doc — this is the Position HUD's live data source):

```ts
{
  equity: number;
  settledCash: number;
  optionsBuyingPower: number;
  positions: Array<{
    symbol: string;       // OSI for options, plain ticker for equities
    assetType: string;    // e.g. "OPTION", "EQUITY"
    quantity: number;     // positive = net long, negative = net short
    averagePrice: number;
    marketValue: number;
    dayProfitLoss: number;
  }>;
  asOf: number; // epoch ms
}
```

### Client → server events

- `subscribe-underlying` — `{ symbol: 'SPY' | 'QQQ' | 'IWM' | 'SPX' | 'SPXW' }` — tells the backend
  which underlying to stream/re-center the ladder around. **This is now fully wired** (previously
  logged but ignored): the backend unsubscribes the old equity quote + option ladder from Schwab's
  streamer, switches to the new root, and resubscribes. There's one shared Schwab streamer
  connection for the whole backend (not one per socket) — the **last** `subscribe-underlying`
  request from any connected client wins for everyone. Strike increment auto-adjusts (1 for
  SPY/QQQ/IWM, 5 for SPX/SPXW), and `SPX` requests automatically use the `SPXW` option root (0DTE
  SPX options trade under that root, not `SPX`).
  - **Supports acks**: if you `emit('subscribe-underlying', { symbol }, callback)`, the callback
    receives `{ status: 'ok' | 'error', symbol: string, message?: string }`. Fire-and-forget
    (no callback) still works, same as before.
  - **SPX/SPXW caveat**: the underlying index price feed for SPX goes through the same
    `LEVELONE_EQUITIES` Schwab streamer service used for equity ETFs, which is
    unverified against Schwab's live streamer for an index (Schwab's docs suggest indices may need
    a different service/quote type). The ack for SPX/SPXW includes a `message` flagging this —
    surface it as a warning banner rather than silently trusting the price feed until we've
    confirmed it against a live account.

**Frontend prompt to paste:**

> "Implement `hooks/useMarketStream.ts` using `socket.io-client` connected to
> `${EXPO_PUBLIC_SOCKET_URL}${EXPO_PUBLIC_SOCKET_NAMESPACE}`. On `option-ticks`, call
> `useMarketStore.updateTicks(payload)` (payload is already keyed by Schwab field-map indices, no
> transform needed). On `underlying-price`, call `setUnderlyingPrice`. On `stream-status` with
> `connected: false`, show a non-blocking 'stale data' banner. Emit `subscribe-underlying` on mount
> with `{ symbol: 'SPY' }`, using the ack callback form so you can show an error toast if the
> backend rejects the symbol or isn't connected to Schwab yet, and a warning banner if the ack
> includes a `message` (currently only for SPX/SPXW)."

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
- **Account snapshot delivery**: streamed over the `/options` socket as an `account-snapshot` event, not REST polling. One socket connection covers ticks, underlying price, balances, and (added) positions.
- **Socket authentication (added after initial build)**: the `/options` gateway broadcasts account balances/positions, so it now requires this backend's own JWT (same one used for REST) via the Socket.io handshake `auth: { token }`. Unauthenticated or invalid-token sockets are disconnected immediately. This was not in the original plan — added before deployment once we flagged it as a security gap.
- **CORS**: `ALLOWED_ORIGINS` (preprod)/`ALLOWED_ORIGINS_DEVELOPMENT` env vars drive CORS for both
  the REST API and the `/options` socket namespace identically. Preprod's list currently includes
  `http://localhost:8081` and `http://localhost:19006` for Expo web dev servers — if your dev
  server runs on a different port, tell me and I'll add it. CORS is irrelevant for native
  iOS/Android builds (browser-only concept); this only matters for Expo web / browser testing.
- **Web OAuth redirect (added)**: `/auth/connect?returnTo=<url>` lets a web client override the
  Expo deep link with a plain URL, validated against the CORS allowlist above (see section 2).
- **Open positions (added, was a gap)**: no separate "positions" concept existed before — now
  included in every `account-snapshot` socket payload, plus an on-demand
  `GET /orders/positions?accountHash=` REST endpoint for initial loads.
- **Account hash discovery (added, was a gap)**: `GET /orders/accounts` lists linked Schwab
  accounts + their hash values, and `GET /auth/status` now also returns `accountHash`, so the
  frontend never has to hardcode or manually ask for it.
- **`subscribe-underlying` (fixed — was previously a no-op)**: now actually switches the shared
  ladder's underlying/option-root/strike-increment and supports SPY/QQQ/IWM fully, SPX/SPXW with a
  flagged caveat on the underlying price feed (see section 4). Supports Socket.io acks.
- **Order endpoint rate limit (fixed — was a gap)**: `OrdersController` now overrides this
  backend's global 10 req/60s guard with 120 req/60s, matching the Schwab-approved per-account
  order limit for this app.
