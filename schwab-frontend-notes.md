# Schwab 0DTE Scalper — Frontend Sync Notes

This file is the shared contract between this backend repo (`nestjs_mega_backend`) and the
separate frontend project (`schwab-0dte-spy-trader` — **TanStack Start web app**, not Expo/React
Native — see correction below). Paste sections of this into your frontend Cursor instance as you
build each piece. I'll update this file as the backend implementation progresses, so re-sync
periodically (diff against your last copy).

> Source spec: "High-Velocity 0DTE Options Scalping Platform" doc (Schwab Trader API + NestJS).
> Backend plan: `schwab` subapp under `src/subapps/schwab/` in this repo.

Status: **Backend implemented (Phase 1: auth, streaming gateway, orders). Auth contract, CORS, and
the OAuth connect redirect have all been live-tested end-to-end from the actual frontend app
against preprod as of 2026-09-02** (sign-in → workspace, "Connect Schwab" → redirects through to
Schwab's real login page). The **only remaining open item** is confirming the Schwab streamer
field mappings / balance field names (section 6) against a live account — that needs someone with
real Schwab credentials to actually complete the OAuth consent screen once on preprod.

---

## ⚠️ Correction: this frontend is a web app (TanStack Start), not Expo

My earlier notes (master build prompt, deep-link instructions, `EXPO_PUBLIC_*` env vars,
`8081`/`19006` dev ports) assumed an Expo/React Native client. The actual frontend is a plain web
app — TanStack Start + Vite, dev server on `http://localhost:3000`, deployed to Netlify at
**`https://schwab-0dte-spy-trader.netlify.app`**. Everything below has been corrected for that:

- No deep links — OAuth success uses `?returnTo=<url>` (section 2), landing on a plain page.
- Env vars use Vite's `VITE_*` convention, not `EXPO_PUBLIC_*`.
- CORS allowlists (both preprod and prod) have been updated and **live-verified** — see section 2b.
- Section 0 (backend's own JWT auth) had an incorrect assumed response shape — **fixed below**,
  this was a real bug in your guess, not just a documentation gap. Read it before touching your
  `authApi.ts`.

---

## 0. Backend's own JWT auth (corrected — your guessed shape was wrong)

This is separate from Schwab's OAuth (section 2) — it's this mega-backend's own authentication
system, required for every `/orders/*` REST call and the `/options` socket handshake.

### `POST /api/v1/authentication/sign-in`

Request body needs **three** fields, not two — `signUpOrIn` is required:

```ts
{
  email: string;
  password: string;      // must satisfy class-validator's IsStrongPassword default:
                          // min 8 chars, ≥1 lowercase, ≥1 uppercase, ≥1 number, ≥1 symbol
  signUpOrIn: 'signin';   // literal string, required — enum has 'signup' | 'signin'
}
```

Response is **nested**, not a flat `{ accessToken, refreshToken }`:

```ts
{
  authData: {
    userInfo: { firstName: string | null; lastName: string | null; imageUrl: string | null; role: string };
    tokens: { accessToken: string; refreshToken: string };
  };
  businesses?: unknown[]; // only present if the user has OnlyBizLinks business associations — ignore this
}
```

So the tokens are at `response.authData.tokens.accessToken` / `.refreshToken`, **not**
`response.accessToken`.

### `POST /api/v1/authentication/sign-up`

Same shape as sign-in, but `signUpOrIn: 'signup'`:

```ts
{ email: string; password: string; signUpOrIn: 'signup' }
// response: { message: string }  -- NOT tokens, you still need to sign in after signing up
```

### `POST /api/v1/authentication/refresh-tokens`

```ts
{ refreshToken: string }
// response: same nested shape as sign-in — { authData: { userInfo, tokens: { accessToken, refreshToken } } }
```

Note the old refresh token is invalidated server-side on use (rotation) — always store the new
`refreshToken` from the response, the old one won't work twice.

### Test credentials (created on preprod for you — verified working just now)

```
email:    schwab-frontend-test@example.com
password: SchwabTest123!
```

I ran this against preprod myself and confirmed both sign-up and sign-in work end-to-end (real
JWTs came back, `role: "basic"`, no elevated role needed for any Schwab endpoint). Use this to
actually exercise the app now — no more guessing/mocking auth.

One more thing so you don't chase a false bug: with this JWT, `GET /auth/status` correctly returns
`{ connected: false, ... }` and `/orders/*` correctly 401s with
`"Schwab account is not connected yet. Visit /auth/connect first."` — that's expected, since no
one has run the actual Schwab OAuth connect flow against preprod yet. That's a separate manual
step (someone with real Schwab credentials needs to click "Connect Schwab" and complete Schwab's
consent screen) — not something either of us can script around. Once that's done once on preprod,
`/orders/*` will start returning real data for this same test account.

**Frontend confirmed (2026-09-02)**: ran the actual app against preprod — sign-in form correctly
round-trips a real JWT and passes the route guard into the workspace, and clicking "Connect
Schwab" correctly opens and redirects all the way through to Schwab's real login page
(`sws-gateway.schwab.com`), stopping there since the frontend doesn't hold real Schwab credentials.
That's as far as either side can verify without someone actually logging into Schwab — I'll do
that next (see "Next step" below).

### Attaching the token

- Every `/orders/*` REST call: `Authorization: Bearer <accessToken>`.
- Socket.io handshake: `auth: { token: accessToken }` (query param or `Authorization` header also
  accepted as fallbacks). Sockets with no/invalid/expired token are disconnected immediately on
  connect.
- On REST 401 or a socket `disconnect` with reason `io server disconnect`: call
  `refresh-tokens` once, retry/reconnect with the new token pulled from
  `authData.tokens.accessToken`, and only surface an auth error if that fails too.
- `/auth/connect`, `/auth/callback`, `/auth/status` (Schwab OAuth, section 2) remain public — no
  bearer token required.

---

## 1. Base URLs & mounting

- REST API prefix: `/api/v1`, `schwab` subapp mounted at `subapps/schwab`.
- Auth endpoints are NOT under the subapp prefix: `/api/v1/authentication/*`.
- Schwab-specific REST: `${VITE_API_BASE_URL}/api/v1/subapps/schwab/<path>`.
- Socket.io gateway, namespace `/options`, same host as the REST API.

**Real deployed URLs:**

```
# Preprod (default — use this for now)
https://nestjs-mega-backend-preprod-420ae4c0c109.herokuapp.com

# Prod
https://nestjs-mega-backend-prod-893a099fba68.herokuapp.com
```

Env vars — Vite convention (`VITE_*`, not `EXPO_PUBLIC_*`):

```
VITE_API_BASE_URL=https://nestjs-mega-backend-preprod-420ae4c0c109.herokuapp.com
VITE_SOCKET_URL=https://nestjs-mega-backend-preprod-420ae4c0c109.herokuapp.com
VITE_SOCKET_NAMESPACE=/options
VITE_UNDERLYING_SYMBOL=SPY
```

---

## 2. Schwab OAuth connect flow (public endpoints, server-driven)

Backend owns the Schwab token lifecycle entirely (proactive rotation at 5 min before expiry,
checked every 10 min). Frontend only needs:

- A "Connect Schwab Account" action.
- `GET /auth/status` → `{ connected: boolean, expiresAt: string | null, accountHash: string | null }`.

**Web flow**: `GET /api/v1/subapps/schwab/auth/connect?returnTo=<url>`. `returnTo` must be an
origin already present in the backend's CORS allowlist (see 2b) — anything else gets a 401
(open-redirect protection). Your flow: open
`/auth/connect?returnTo=${origin}/schwab-connected` in a new tab, land on your own
`/schwab-connected` page, and independently poll `/auth/status` from the Settings page to update
the Connected badge.

### 2b. CORS — how it actually works (important correction)

Your ask was "add `localhost:3000` to `ALLOWED_ORIGINS_DEVELOPMENT`" — that's not how this
backend's CORS is wired, and doing it that way would **not** have worked. The var this backend
reads is chosen by **this backend's own `ENVIRONMENT` var**, not by whether the origin itself
looks like a dev or prod URL:

- `ENVIRONMENT=development` (only when *this NestJS backend* is run locally on someone's machine)
  → reads `ALLOWED_ORIGINS_DEVELOPMENT`.
- `ENVIRONMENT=preprod` or `ENVIRONMENT=prod` (both deployed Heroku apps) → reads `ALLOWED_ORIGINS`.

Since you're hitting the **deployed preprod Heroku app** (not running this backend locally),
preprod's `ENVIRONMENT=preprod`, so it only ever reads `ALLOWED_ORIGINS` — regardless of whether
your origin is `http://localhost:3000` or a deployed Netlify URL. `ALLOWED_ORIGINS_DEVELOPMENT`
on preprod/prod is unused dead weight.

**Done — I've already updated and live-verified both:**

- **Preprod `ALLOWED_ORIGINS`** now includes `http://localhost:3000` and
  `https://schwab-0dte-spy-trader.netlify.app` (removed the stale Expo `8081`/`19006` entries).
- **Prod `ALLOWED_ORIGINS`** now also includes `https://schwab-0dte-spy-trader.netlify.app`, for
  whenever you point the frontend at prod.

Verified with a live preflight request against preprod just now:

```
$ curl -i -X OPTIONS https://nestjs-mega-backend-preprod-420ae4c0c109.herokuapp.com/api/v1/authentication/sign-in \
    -H "Origin: https://schwab-0dte-spy-trader.netlify.app" \
    -H "Access-Control-Request-Method: POST"

HTTP/1.1 204 No Content
Access-Control-Allow-Credentials: true
Access-Control-Allow-Origin: https://schwab-0dte-spy-trader.netlify.app
```

Both your deployed Netlify origin and `localhost:3000` are cleared for REST + the `/options`
socket right now — no further backend changes needed for CORS.

---

## 3. Order execution + account endpoints (REST)

All require `Authorization: Bearer <accessToken>` (section 0). No preview/confirmation step on
order dispatch.

### `POST /api/v1/subapps/schwab/orders/fast-execute`
```ts
// request (FastOrderDto)
{
  accountHash: string
  symbol: string // 21-char OSI
  instruction: 'BUY_TO_OPEN' | 'SELL_TO_CLOSE' | 'SELL_TO_OPEN' | 'BUY_TO_CLOSE'
  quantity: number
  orderType: 'LIMIT' | 'MARKET'
  price?: number
  slippageTolerance?: number
}
// response
{ status: 'SUBMITTED'; statusCode: number; latencyMs: number; orderLocation: string | null }
```

### `POST /api/v1/subapps/schwab/orders/flatten`
```ts
{ accountHash: string; symbol: string; quantity: number } // -> same response as fast-execute
```

### `POST /api/v1/subapps/schwab/orders/reverse`
```ts
// request
{ accountHash: string; closeSymbol: string; openSymbol: string; quantity: number }
// response
{ status: 'REVERSED'; closed: <fast-execute response>; opened: <fast-execute response> }
```

### `GET /api/v1/subapps/schwab/orders/accounts`
```ts
Array<{ accountNumber: string; hashValue: string }>
```

### `GET /api/v1/subapps/schwab/orders/positions?accountHash=<hash>`
On-demand fetch for initial Position HUD load; prefer the `account-snapshot` socket event
(section 4) for live updates.
```ts
Array<{
  symbol: string       // OSI for options, plain ticker for equities
  assetType: string    // e.g. "OPTION", "EQUITY"
  quantity: number      // positive = net long, negative = net short
  averagePrice: number
  marketValue: number
  dayProfitLoss: number
}>
```

### Error response shape (all endpoints)
```ts
{ statusCode: number; message: string | string[]; error: string }
```
`message` is a string for most errors but a string array for `class-validator` DTO failures. Your
`lib/api.ts` flattening (join with `; `) is the right approach.

### Rate limiting
`OrdersController` allows **120 req/60s per IP** (overriding this backend's global 10/60s
default), matching the Schwab-approved per-account order limit.

---

## 4. Real-time streaming (Socket.io namespace `/options`)

Connect with this backend's JWT (section 0):
```ts
io(`${VITE_SOCKET_URL}${VITE_SOCKET_NAMESPACE}`, {
  transports: ['websocket'],
  auth: { token: accessToken }, // pull from authData.tokens.accessToken, see section 0
})
```

### Server → client events
- **`underlying-price`** — `{ symbol: string, price: number, timestamp: number }`.
- **`option-ticks`** — batched array, ~50ms throttle:
  ```ts
  type OptionTickRaw = {
    '0': string; '1': number; '2': number; '3': number // symbol, bid, ask, last (always present)
    '4'?: number; '5'?: number; '8'?: number; '9'?: number; '16'?: number; '17'?: number
    // bid size, ask size, volume, OI, delta, gamma (optional)
  }
  ```
- **`ladder-recentered`** — `{ centerStrike: number, symbols: string[] }`. Parse each OSI symbol
  (`lib/osi.ts`) into ladder rows yourself.
- **`stream-status`** — `{ connected: boolean, lastFrameAt: number | null }` — backend's own
  Schwab-streamer health; drives the "stale data" banner directly.
- **`account-snapshot`** — every ~4s, includes `positions`:
  ```ts
  {
    equity: number
    settledCash: number
    optionsBuyingPower: number
    positions: Array<{ symbol: string; assetType: string; quantity: number; averagePrice: number; marketValue: number; dayProfitLoss: number }>
    asOf: number
  }
  ```

### Client → server events
- **`subscribe-underlying`** — `{ symbol: 'SPY' | 'QQQ' | 'IWM' | 'SPX' | 'SPXW' }`. Switches the
  shared ladder's underlying/option root/strike increment for **all** connected clients (one
  shared Schwab streamer connection backend-wide; last request wins). `SPX` auto-maps to the
  `SPXW` 0DTE option root.
  - **Supports acks**: `emit('subscribe-underlying', { symbol }, callback)` →
    `{ status: 'ok' | 'error', symbol: string, message?: string }`.
  - **SPX/SPXW caveat** (still unverified — see section 6): the underlying price feed for these
    currently reuses the equity-quote streamer service, unverified against Schwab's live streamer
    for an index. The ack includes a `message` flagging this — show as a warning banner.

---

## 5. OSI option symbol format
21 chars: root (6, space-padded) + `YYMMDD` + `C`/`P` + strike×1000 (zero-padded 8 digits).
Backend reference: `src/subapps/schwab/streaming/osi-symbol.util.ts` (unit tested — worth diffing
against your `src/lib/osi.ts` once you have a moment).

## 6. Pre-flight affordability check (unchanged)
```
tradeCost = q * p * 100
affordable = tradeCost <= B && (E >= 2000 || tradeCost <= C)
```
Sourced from `account-snapshot`. Stale hint if `asOf` older than ~10s.

**Still genuinely unverified against a live Schwab account** (not just a caveat I'm repeating
reflexively): the streamer field-map indices in section 4 and the balance field names
(`equity`/`settledCash`/`optionsBuyingPower`) in `account-data.mapper.ts` were built from Schwab's
public API docs, not exercised against real account data yet. Once you're signed in with the test
credentials above and connect a real (or paper) Schwab account, any mismatch here is a backend
mapping bug — report it, don't work around it client-side.

## 7. Git remote / CI for your Netlify deploy
Up to you and outside this backend's scope, but since you asked: yes, wiring up Netlify's GitHub
integration (push-to-deploy) instead of manual `netlify deploy` CLI calls is the standard move
once you have a remote. Nothing on the backend depends on how your deploys are triggered — CORS is
keyed off the resulting origin URL, which won't change either way.

---

## Open items / asks for backend — status

1. ~~This is a web app, not Expo~~ — **resolved.**
2. ~~Exact `sign-in`/`refresh-tokens` field names~~ — **resolved.** Frontend updated
   `src/types/auth.ts` / `src/lib/authApi.ts` to match and live-tested sign-in through the actual
   running app against preprod.
3. ~~Add `http://localhost:3000`~~ — **resolved**, live-verified.
4. ~~Add `https://schwab-0dte-spy-trader.netlify.app`~~ — **resolved**, live-verified on both
   preprod and prod.
5. **Open — last remaining blocker**: streamer field mappings / balance field names (section 6).
   Frontend confirmed "Connect Schwab" correctly redirects to Schwab's real login page, but neither
   side can go further without someone completing the actual Schwab consent flow with real
   credentials. **Next step**: I'll complete this myself on preprod (see below), then we can
   confirm field mappings against real streamed data and close this out.
6. **New from frontend**: no git remote/CI yet for their Netlify deploy — their call, doesn't block
   anything on this backend (CORS is keyed off the resulting origin, not the deploy mechanism).

## Changelog
- **2026-09-02 (frontend live-test)**: Frontend confirmed everything end-to-end against preprod —
  real sign-in round-trip through the actual app (not just curl), "Connect Schwab" redirects
  through to Schwab's real login page. Updated `src/lib/authApi.ts` to unwrap the nested
  `authData.tokens` shape. Only remaining open item is live field-mapping verification, blocked on
  someone completing the real OAuth consent screen once.
- **2026-09-02 (later)**: Corrected section 0 — sign-in/sign-up/refresh-tokens actually require a
  `signUpOrIn` field and return a nested `{ authData: { userInfo, tokens } }` shape, not the
  guessed flat `{ accessToken, refreshToken }`. Verified both endpoints live and created a real
  test account on preprod (`schwab-frontend-test@example.com`). Fixed CORS: added
  `http://localhost:3000` and `https://schwab-0dte-spy-trader.netlify.app` to **preprod's**
  `ALLOWED_ORIGINS` (not `_DEVELOPMENT` — clarified why in section 2b), added the Netlify origin to
  **prod's** `ALLOWED_ORIGINS` too, removed stale Expo dev-port entries, live-verified with a CORS
  preflight request. Rewrote Expo-specific instructions (deep links, `EXPO_PUBLIC_*`) for the
  actual TanStack Start web frontend.
- **2026-09-02**: Major update from backend — added section 0 (backend's own JWT auth, now
  required for orders + socket), real deployed preprod/prod URLs, `returnTo` param for web-friendly
  OAuth redirect, `GET /orders/accounts` + `GET /orders/positions` + `account-snapshot.positions`,
  confirmed error shape, confirmed rate limit (120/60s on orders), `subscribe-underlying` fully
  wired with ack support and SPY/QQQ/IWM/SPX/SPXW, SPX/SPXW price-feed caveat.
- **2026-08-28**: Replaced initial draft with backend's first confirmed contract (base path
  `/api/v1/subapps/schwab`, socket namespace `/options`, `account-snapshot` over socket,
  `ladder-recentered` raw symbols, simplified `underlying-price`, auth via `/auth/connect` +
  `/auth/status`).
