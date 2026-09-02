# Schwab 0DTE Scalper — Frontend Sync Notes

This file is the shared contract between this backend repo (`nestjs_mega_backend`) and the
separate frontend project (`schwab-0dte-spy-trader` — TanStack Start, **web**). There's no shared
package/schema between the two repos, so **both sides keep this file in sync manually** by
copy-pasting sections back and forth as the contract evolves. Check the Changelog at the bottom
whenever a new copy comes in.

Status: **Fully live end-to-end on preprod and prod as of 2026-09-02.** A real Schwab account is
connected on preprod; sign-in, CORS, orders/accounts/positions endpoints, and the `/options`
socket (`account-snapshot` + `stream-status`) have all been verified against real data. Two real
backend bugs were found and fixed along the way (see Changelog) — both frontend-reported, both
now fixed and deployed to preprod + prod.

---

## ✅ Resolved: this is a web app (TanStack Start), not Expo

No deep links — OAuth success uses `?returnTo=<url>` (section 2), landing on the frontend's own
`/schwab-connected` page. Env vars use Vite's `VITE_*` convention. Dev server port `3000`.
Production: `https://schwab-0dte-spy-trader.netlify.app`. Both origins are CORS-cleared on
preprod (and the Netlify origin on prod too) — see section 2b.

## 0. Backend's own JWT auth — CONFIRMED, live-tested

Separate from Schwab's OAuth (section 2) — this mega-backend's own auth system, required for
every `/orders/*` REST call and the `/options` socket handshake.

### `POST /api/v1/authentication/sign-in`

```ts
{
  email: string
  password: string    // class-validator IsStrongPassword: min 8 chars, ≥1 lower, ≥1 upper, ≥1 number, ≥1 symbol
  signUpOrIn: 'signin' // literal, required — enum is 'signup' | 'signin'
}
```

Response — **nested**, tokens are at `authData.tokens`, not top-level:

```ts
{
  authData: {
    userInfo: { firstName: string | null; lastName: string | null; imageUrl: string | null; role: string }
    tokens: { accessToken: string; refreshToken: string }
  }
  businesses?: unknown[] // OnlyBizLinks association artifact — ignore
}
```

### `POST /api/v1/authentication/sign-up`

```ts
{ email: string; password: string; signUpOrIn: 'signup' }
// response: { message: string } -- no tokens, sign in separately after
```

Returns `409 { message: "Conflict" }` if the email already exists on this backend (shared across
every subapp, not Schwab-specific — see the bug note below for what that can imply).

### `POST /api/v1/authentication/refresh-tokens`

```ts
{ refreshToken: string }
// response: same nested shape as sign-in
```

Old refresh token is invalidated server-side on use (rotation) — always store the new one.

### Test credentials (preprod)

```
email:    schwab-frontend-test@example.com
password: SchwabTest123!
```

Verified working end-to-end repeatedly throughout testing. Role `basic`, no elevated role needed
for any Schwab endpoint.

### Attaching the token

- Every `/orders/*` REST call: `Authorization: Bearer <accessToken>`.
- Socket.io handshake: `auth: { token: accessToken }` (query param / `Authorization` header also
  accepted as fallbacks). Sockets with no/invalid/expired token disconnect immediately.
- On REST 401 or socket `disconnect` reason `io server disconnect`: call `refresh-tokens` once,
  retry/reconnect with the new token, only surface an auth error if that fails too.
- `/auth/connect`, `/auth/callback`, `/auth/status` (section 2) remain public — no bearer token.

### ⚠️ Bug fixed 2026-09-02: `sign-in` 500'd instead of 401'ing for Google-only accounts

**Reported by frontend, root-caused and fixed by backend same day.** If a `Users` row was created
via this mega-backend's Google OAuth flow (a different code path than this Schwab-specific auth,
used by other subapps on this backend), it never gets a `password` set — that column is
nullable. `AuthenticationService.signIn` called `bcrypt.compare(password, user.password)`
unconditionally; `bcrypt.compare` throws on a `null` hash, which was uncaught and surfaced as a
raw `500` instead of a normal auth failure.

Confirmed via the preprod DB: the specific account the frontend hit
(`jfc3303@gmail.com`) has `password: NULL` and a `googleId` set. **Fixed**: `signIn` now checks
for a missing password first and throws a clean `401` (`"This account has no password set
(likely signed up via Google) — sign in with Google instead"`). Deployed to both preprod and
prod, live-verified on both, and confirmed no regression on normal sign-in. This was a
pre-existing bug in shared code, not something either side's contract work introduced — no
frontend changes needed.

---

## 1. Base URLs & mounting

- REST API prefix: `/api/v1`, `schwab` subapp mounted at `subapps/schwab`.
- Auth endpoints are NOT under the subapp prefix: `/api/v1/authentication/*`.
- Socket.io gateway, namespace `/options`, same host as the REST API.

```
# Preprod (default)
https://nestjs-mega-backend-preprod-420ae4c0c109.herokuapp.com
# Prod
https://nestjs-mega-backend-prod-893a099fba68.herokuapp.com
```

```
VITE_API_BASE_URL=https://nestjs-mega-backend-preprod-420ae4c0c109.herokuapp.com
VITE_SOCKET_URL=https://nestjs-mega-backend-preprod-420ae4c0c109.herokuapp.com
VITE_SOCKET_NAMESPACE=/options
VITE_UNDERLYING_SYMBOL=SPY
```

## 2. Schwab OAuth connect flow (public endpoints, server-driven)

- `GET /auth/status` → `{ connected: boolean, expiresAt: string | null, accountHash: string | null }`.
  Note: `accountHash` here reflects an optional `SCHWAB_ACCOUNT_HASH` config override (usually
  unset/`null`) — use `GET /orders/accounts` (section 3) for the real dynamically-resolved hash.
- **Web flow**: `GET /api/v1/subapps/schwab/auth/connect?returnTo=<url>`. `returnTo` must be an
  origin already in the CORS allowlist (2b) or gets a 401. Flow: open
  `/auth/connect?returnTo=${origin}/schwab-connected` in a new tab, land on the frontend's own
  page, poll `/auth/status` from Settings for the Connected badge.
- **Live-verified end to end**: a real Schwab account is connected on preprod as of 2026-09-02.

### 2b. CORS

Keyed off **this backend's own `ENVIRONMENT` var**, not the calling origin's shape:
`ENVIRONMENT=development` (backend run locally) reads `ALLOWED_ORIGINS_DEVELOPMENT`;
`ENVIRONMENT=preprod`/`prod` (both deployed Heroku apps) reads `ALLOWED_ORIGINS`. Since the
frontend always hits the deployed apps, only `ALLOWED_ORIGINS` matters here.

**Live-verified on both:**
- Preprod `ALLOWED_ORIGINS`: `http://localhost:3000` + `https://schwab-0dte-spy-trader.netlify.app`.
- Prod `ALLOWED_ORIGINS`: `https://schwab-0dte-spy-trader.netlify.app`.

## 3. Order execution + account endpoints (REST)

All require `Authorization: Bearer <accessToken>` (section 0).

### `POST /api/v1/subapps/schwab/orders/fast-execute`
```ts
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
{ accountHash: string; symbol: string; quantity: number } // -> fast-execute response shape
```

### `POST /api/v1/subapps/schwab/orders/reverse`
```ts
{ accountHash: string; closeSymbol: string; openSymbol: string; quantity: number }
// response: { status: 'REVERSED'; closed: <fast-execute response>; opened: <fast-execute response> }
```

### `GET /api/v1/subapps/schwab/orders/accounts`
```ts
Array<{ accountNumber: string; hashValue: string }>
```
Confirmed live: returns the real connected account's number + hash on preprod.

### `GET /api/v1/subapps/schwab/orders/positions?accountHash=<hash>`
```ts
Array<{ symbol: string; assetType: string; quantity: number; averagePrice: number; marketValue: number; dayProfitLoss: number }>
```
Confirmed live (returns `[]` for the connected test account — no open positions).

### Error response shape
```ts
{ statusCode: number; message: string | string[]; error: string }
```
`message` is a string for most errors, a string array for `class-validator` DTO failures.

### Rate limiting
`OrdersController`: 120 req/60s per IP (overrides this backend's global 10/60s default).

## 4. Real-time streaming (Socket.io namespace `/options`)

```ts
io(`${VITE_SOCKET_URL}${VITE_SOCKET_NAMESPACE}`, {
  transports: ['websocket'],
  auth: { token: accessToken },
})
```

### Server → client events
- **`underlying-price`** — `{ symbol: string, price: number, timestamp: number }`.
- **`option-ticks`** — batched array, ~50ms throttle:
  ```ts
  type OptionTickRaw = {
    '0': string; '1': number; '2': number; '3': number // symbol, bid, ask, last
    '4'?: number; '5'?: number; '8'?: number; '9'?: number; '16'?: number; '17'?: number
    // bid size, ask size, volume, OI, delta, gamma
  }
  ```
- **`ladder-recentered`** — `{ centerStrike: number, symbols: string[] }`.
- **`stream-status`** — `{ connected: boolean, lastFrameAt: number | null }`. **Live-verified**:
  `connected: true` observed against the real connected account.
- **`account-snapshot`** — every ~4s:
  ```ts
  {
    equity: number
    settledCash: number
    optionsBuyingPower: number
    positions: Array<{ symbol: string; assetType: string; quantity: number; averagePrice: number; marketValue: number; dayProfitLoss: number }>
    asOf: number
  }
  ```
  **Live-verified** — see section 6 for the real observed payload and a bug that was blocking
  this entirely until fixed.

### Client → server events
- **`subscribe-underlying`** — `{ symbol: 'SPY' | 'QQQ' | 'IWM' | 'SPX' | 'SPXW' }`. Shared
  backend-wide streamer (last request wins for all clients). Supports acks:
  `emit('subscribe-underlying', { symbol }, callback)` →
  `{ status: 'ok' | 'error', symbol: string, message?: string }`.
  - **SPX/SPXW caveat (still unverified)**: underlying price feed reuses the equity-quote
    streamer service, unverified for an index. Ack includes a `message` flagging this.

## 5. OSI option symbol format
21 chars: root (6, space-padded) + `YYMMDD` + `C`/`P` + strike×1000 (zero-padded 8 digits).
Backend reference: `src/subapps/schwab/streaming/osi-symbol.util.ts`.

## 6. Pre-flight affordability check
```
tradeCost = q * p * 100
affordable = tradeCost <= B && (E >= 2000 || tradeCost <= C)
```
Sourced from `account-snapshot`.

**Confirmed against a live Schwab account** (connected on preprod 2026-09-02):
```json
{ "equity": 4.99, "settledCash": 4.99, "optionsBuyingPower": 4.99, "positions": [], "asOf": 1788362140783 }
```
Low-balance account, no open positions, so the three identical balance values aren't fully
conclusive proof each maps to a genuinely distinct Schwab field — worth a second look with a
less trivial balance, but the pipeline is confirmed working end-to-end. This required fixing a
real bug first: `AccountSnapshotService` was reading an unset `SCHWAB_ACCOUNT_HASH` config value
instead of resolving the hash dynamically (same lookup `GET /orders/accounts` uses), so
`account-snapshot` was silently never broadcasting (`Invalid account number` in logs, ~every 4s).
Fixed to resolve + cache the real hash; re-verified live afterward.

**Still open**: streamer **tick** field-map indices (section 4, `'0'`/`'1'`/`'2'`/etc.) —
unverified, needs an actual open option position generating live ticks. Nothing to do on either
side until that happens; any mismatch found then is a backend mapping bug.

## 7. Git remote / CI, sign-up UI
Both resolved on the frontend side — GitHub repo + Netlify push-to-deploy wired up, and a Sign In
/ Create Account toggle shipped on `/sign-in`. No backend action needed.

---

## Open items — status

All prior items resolved. Current state:
1. Streamer **tick** field mappings — still open, blocked on an open option position generating
   live ticks (see section 6).
2. Everything else (auth contract, CORS, OAuth connect, orders/accounts/positions, account
   balances, both reported bugs) — confirmed live on preprod (and prod for the auth bug fix).

## Changelog

- **2026-09-02 (sign-in 500 bug fix)**: Frontend diagnosed and reported `sign-in` returning a raw
  `500` instead of `401` for a real account (`jfc3303@gmail.com`) — ruled out their own
  implementation first with a clean throwaway sign-up/sign-in repro against preprod. Backend
  root-caused via the preprod DB: that account was created through this backend's separate Google
  OAuth flow (used by other subapps), so it has `password: NULL`; `bcrypt.compare` throws on a
  null hash, uncaught, → 500. Fixed `AuthenticationService.signIn` to check for a missing password
  and return a clean 401 first. Deployed to both preprod and prod, live-verified on both, no
  regression on normal sign-in.
- **2026-09-02 (live Schwab connection + account-snapshot bug fix)**: Completed the real Schwab
  OAuth consent flow on preprod. Found and fixed a real bug: `AccountSnapshotService` read an
  unset `SCHWAB_ACCOUNT_HASH` config value instead of resolving the hash dynamically, so
  `account-snapshot` never broadcast (silent `Invalid account number` failures). Fixed to resolve
  via the same `GET /orders/accounts` lookup, cached after first success. Verified live
  end-to-end: real account hash, real (empty) positions, real balances, `stream-status: connected:
  true`. Tick field mappings still need an open position to verify.
- **2026-09-02 (frontend live-test + auth contract fix)**: Frontend confirmed sign-in, CORS, and
  the OAuth redirect all work end-to-end through the actual running app. Backend corrected section
  0 — sign-in/sign-up/refresh-tokens require a `signUpOrIn` field and return a nested
  `{ authData: { userInfo, tokens } }` shape (frontend's original flat-shape guess was wrong).
  Fixed CORS: `http://localhost:3000` and the Netlify origin added to preprod's `ALLOWED_ORIGINS`
  (not `_DEVELOPMENT` — clarified why), Netlify origin also added to prod's.
- **2026-09-02 (Netlify)**: Frontend deployed production to Netlify
  (`https://schwab-0dte-spy-trader.netlify.app`).
- **2026-09-02**: Major backend update — section 0 (JWT auth required for orders + socket), real
  deployed preprod/prod URLs, `returnTo` param for web OAuth redirect, `GET /orders/accounts` +
  `GET /orders/positions` + `account-snapshot.positions`, confirmed error shape, confirmed rate
  limit, `subscribe-underlying` fully wired with acks and SPY/QQQ/IWM/SPX/SPXW support.
- **2026-08-28**: Initial confirmed contract (base path, socket namespace, `account-snapshot`
  over socket, `ladder-recentered` raw symbols, auth via `/auth/connect` + `/auth/status`).
