# Schwab 0DTE Scalper — Frontend Sync Notes

This file is the shared contract between this backend repo (`nestjs_mega_backend`) and the
separate frontend project (`schwab-0dte-spy-trader` — TanStack Start, **web**). There's no shared
package/schema between the two repos, so **both sides keep this file in sync manually** by
copy-pasting sections back and forth as the contract evolves. Check the Changelog at the bottom
whenever a new copy comes in.

Status: **Fully live end-to-end on preprod and prod as of 2026-09-02, including real-time
streaming.** A real Schwab account is connected on preprod; sign-in, CORS,
orders/accounts/positions endpoints, and the `/options` socket (`option-ticks`,
`underlying-price`, `ladder-recentered`, `account-snapshot`, `stream-status`) have all been
live-verified with real, continuously-updating market data. Four real backend bugs were found and
fixed along the way (see Changelog) — all frontend-reported/flagged, all now fixed and deployed to
preprod + prod, including two serious ones: a token-refresh race condition that was silently
killing the Schwab connection, and a malformed streamer request that was causing a rapid
connect→login→kicked crash loop (this is what caused the `stream-status` flapping / zero
ladder-recentered/option-ticks bug report below).

⚠️ **If you're pasting from an older frontend copy of this file that still shows open item 8
(streamer flapping / no ladder / stale `account-snapshot`) as unresolved: that's stale.** It was
root-caused and fixed the same day it was reported — see the "streaming crash-loop bug fix"
changelog entry below and the Status line above. Nothing outstanding on that front.

**New (2026-09-02): the chart backfill + live candle contract (frontend's section 9) is now
implemented** — `GET .../market-data/price-history`, `subscribe-option-chart`, and `chart-candle`
are all live on preprod + prod as of this update. See section 9 below for the full contract as
implemented, including the answer to the 9d open question.

**New (2026-09-02): the broker stop-loss / working-orders contract (frontend's section 10 ask,
chart drag-to-stop) is now implemented** — `fast-execute` accepts `STOP`/`STOP_LIMIT` +
`stopPrice` and returns `orderId`, `GET .../orders/working` lists resting orders, and
`DELETE .../orders/:orderId` cancels one (trail = cancel + re-place). The optional `order-update`
socket event also shipped. See section 10 below for the full contract as implemented.

🐛 **Bug fix (2026-09-03): blank options chain, root-caused and fixed same day.** Frontend
reported the options chain rendering completely empty during RTH right after this section 10
work landed. Turned out to be unrelated to section 10 — a real, pre-existing bug in the option
ladder's re-centering logic (see the new Changelog entry and section 8 addendum below) that was
live on preprod well before today. Fixed and redeployed to preprod + prod, confirmed live: zero
`LEVELONE_OPTIONS` subscription churn in a 2.5-minute post-deploy window that previously showed
dozens of churn events in the same span.

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
  `accountHash` now resolves the same way `GET /orders/accounts` does (dynamic lookup, cached) —
  **`GET /orders/accounts` is still the source of truth** if you need more than the first account,
  but `/auth/status.accountHash` is no longer stale/always-`null` (see Changelog, "auth/status
  accountHash + connection-death bug fix").
- ⚠️ **If you were relying on `connected: true` alone to mean "will actually work"**: as of the fix
  below, `connected` now reflects whether the backend still holds a live, refreshable Schwab
  session — it flips to `false` immediately if Schwab has revoked the token (previously it could
  say `true` for up to 7 days after the connection was actually dead server-side). If you ever see
  `connected: false` after previously connecting, the fix is the same as a first-time connect: hit
  `/auth/connect` again.
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
  orderType: 'LIMIT' | 'MARKET' | 'STOP' | 'STOP_LIMIT'
  price?: number       // required for LIMIT (limit price) and STOP_LIMIT (limit leg)
  stopPrice?: number   // required for STOP and STOP_LIMIT (trigger price)
  slippageTolerance?: number // LIMIT only; ignored for STOP/STOP_LIMIT
}
// response
{
  status: 'SUBMITTED'
  statusCode: number
  latencyMs: number
  orderLocation: string | null
  orderId: string | null // parsed from the Location header — see section 10a
}
```
> `STOP`/`STOP_LIMIT` + `stopPrice` are the broker-resting-stop extension asked for in section 10
> (chart drag-to-stop) — **implemented 2026-09-02**, see section 10 for the full contract
> including `GET .../orders/working` and cancel.

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
- **`ladder-recentered`** — `{ centerStrike: number, symbols: string[] }`. **Live-verified** with
  real ticking option symbols (see the streaming bug fix in the Changelog). Also now sent
  immediately on connect if the ladder is already established (see "late-joiner replay" below) —
  previously a client connecting after the ladder had already stabilized got nothing until the
  next actual re-center, which could be a long wait.
- **`stream-status`** — `{ connected: boolean, lastFrameAt: number | null }`. **Live-verified**:
  `connected: true`, stable, no flapping (see Changelog for the bug that used to cause constant
  `true`→`false` flapping). Also now sent immediately on connect (see "late-joiner replay" below).
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
- **`order-update`** (new, 2026-09-02 — section 10d) — broadcast whenever a resting order's
  status/fill changes, so the chart can flip entry→closed and clear stop lines without polling
  `GET .../orders/working` itself:
  ```ts
  {
    accountHash: string
    orderId: string
    symbol: string
    status: string // WORKING | FILLED | CANCELED | REJECTED | ...
    orderType?: string | null
    stopPrice?: number | null
    price?: number | null
    filledQuantity?: number
    averageFillPrice?: number | null // quantity-weighted across execution legs; null until any fill
    asOf: number // epoch ms
  }
  ```
  Backend polls Schwab's orders endpoint on the same ~3s cadence as `account-snapshot` and only
  emits when something the frontend cares about actually changed (status/fill/price/stopPrice) —
  not on every poll tick. Not yet live-tested against a real order (needs a real STOP placed
  during RTH) — see section 10 for the full writeup and open acceptance checks.
- **Late-joiner replay (new, 2026-09-02)**: `stream-status` and (if already established)
  `ladder-recentered` are now sent directly to a socket immediately on successful connection,
  reflecting current state rather than waiting for the next change. Relevant any time a client
  connects/reconnects after the streamer has already stabilized (page refresh, network blip, tab
  reopen, etc.) — you should now always get both without needing to wait or re-trigger
  `subscribe-underlying`.

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

## 9. Chart backfill + live candle streaming — **implemented 2026-09-02**

Implements the frontend's section 9 ask (chart backfill REST + live `chart-candle` streaming) in
full — 9a through 9c below, live on preprod + prod. Section 9's original priority note said this
was P1/parallelizable and OK to build without waiting on item 8 (streamer flapping) — moot now
since item 8 was already fixed same-day it was reported.

### 9a. `GET /api/v1/subapps/schwab/market-data/price-history`

Implemented exactly as specced: thin authenticated proxy to Schwab's
`GET /marketdata/v1/pricehistory`, pass-through query params
(`symbol`, `periodType`, `period`, `frequencyType`, `frequency`, `startDate`, `endDate`), requires
`Authorization: Bearer <accessToken>` (same guard as `/orders/*`), and a normalized response —
**not** Schwab's raw envelope:

```ts
{
  symbol: string
  candles: Array<{ datetime: number; open: number; high: number; low: number; close: number; volume: number }>
}
```

Errors use the same shape as section 3 (`{ statusCode, message, error }`). Rate limit override:
60 req/60s per IP (global default is 10/60s — a trader flipping timeframes can easily exceed
that).

**Live-verified 2026-09-02** with a direct authenticated `curl` against preprod:
`?symbol=SPY&periodType=day&period=1&frequencyType=minute&frequency=1` → `200` with **726**
one-minute SPY candles, correct normalized shape (`datetime`/`open`/`high`/`low`/`close`/`volume`),
first candle `datetime: 1788260400000` (today's session open) through the last available minute.
9a is confirmed fully working end-to-end.

### 9b. `subscribe-option-chart` (client → server) + piggybacked `CHART_EQUITY`

Implemented as specced on the `/options` namespace:

```ts
emit('subscribe-option-chart', { symbol: string | null }, (ack) => ...)
// ack: { status: 'ok' | 'error', symbol: string, message?: string }
```

Shared backend-wide subscription (last request wins, mirrors `subscribe-underlying`). `symbol:
null` unsubscribes without touching the underlying's own chart stream — ack's `symbol` comes back
as `''` in that case. Independent of `subscribe-underlying`/underlying switches: the tracked
option chart symbol is not cleared when the underlying changes.

**`CHART_EQUITY` piggyback**: implemented as specced — whenever the backend starts (or swaps) the
`LEVELONE_EQUITIES` quote subscription for the current underlying (on initial connect and on
every `subscribe-underlying` switch), it now also starts/swaps a Schwab `CHART_EQUITY`
subscription for that same symbol. No separate client event needed, exactly as asked.

One implementation detail worth knowing: if the backend's socket to Schwab has to reconnect (rare
now that item 8 is fixed, but still possible on a network blip or dyno restart), both the
underlying's `CHART_EQUITY` subscription *and* any active tracked-option `CHART_OPTIONS`
subscription are automatically re-armed on the new login — you should not need to re-emit
`subscribe-option-chart` after a transient backend-side reconnect. (This does not cover the
frontend's own socket reconnecting — if your socket itself drops and reconnects, re-emit
`subscribe-option-chart` for whatever symbol you're tracking, same as you'd re-emit
`subscribe-underlying`.)

⚠️ **Live-tested 2026-09-02, after-hours (~7:42pm ET) — one real finding**: `CHART_EQUITY/SUBS`
for `SPY` was accepted by Schwab with no error. But `CHART_OPTIONS/SUBS` for a live 0DTE OSI
symbol came back with **`{"code":11,"msg":"Service not available or temporary down."}`** — logged
cleanly, no socket disconnect/crash-loop (confirmed the connection stayed healthy afterward,
unlike the old "Bad command formatting" bug). Given today's already-confirmed finding that 0DTE
**options** have no after-hours session at all (see the "after-hours behavior" changelog entry),
this is most likely Schwab's `CHART_OPTIONS` service simply refusing subscriptions outside RTH for
options specifically — but that's a guess, not confirmed, since it could also be a capability this
dev account/tier doesn't have. **Needs a retest during regular market hours (9:30am–4pm ET)**
before treating this as either "expected after-hours behavior, ignore" or "real bug, dig further."
Ack still returns `{ status: 'ok' }` on our side regardless (Schwab accepts the SUBS request frame
itself; the error is Schwab declining to actually stream anything back) — so the frontend won't
see an error from the ack, only silence where a `chart-candle` should be. Will update this section
after the next market open.

### 9c. `chart-candle` (server → client)

Implemented exactly as specced:

```ts
{
  symbol: string
  assetType: 'EQUITY' | 'OPTION'
  open: number
  high: number
  low: number
  close: number
  volume: number
  chartTime: number // epoch ms
}
```

Emitted directly (not batched/throttled like `option-ticks` — 1-minute candles are low-frequency
enough not to need it) as soon as a `CHART_EQUITY`/`CHART_OPTIONS` frame arrives from Schwab.
Field maps used, matching what the frontend already had documented:
- `CHART_EQUITY`: `0`=key, `1`=open, `2`=high, `3`=low, `4`=close, `5`=volume, `6`=sequence,
  `7`=chartTime, `8`=chartDay.
- `CHART_OPTIONS`: `0`=key, `1`=chartTime, `2`=open, `3`=high, `4`=low, `5`=close, `6`=volume.

**Live-tested 2026-09-02, after-hours — no `chart-candle` observed yet for either asset type**,
despite `CHART_EQUITY/SUBS` being accepted cleanly (no error) and `underlying-price`/
`account-snapshot`/`ladder-recentered` all confirmed flowing normally on the same connection over
a 90s window. Two candidate explanations, neither confirmed yet:
1. **Thin/zero after-hours volume** (most likely, benign): per Schwab's public field docs,
   `CHART_EQUITY` is documented to update in both regular *and* AM/PM (extended) hours - but
   candle-close events may simply require at least one trade in that minute to fire, and at
   ~7:40pm ET extended-hours SPY volume can be genuinely near-zero for a given minute even while
   the quote (`underlying-price`) still refreshes.
2. A code-level issue in `handleChartEquityCandles`/the `CHART_EQUITY` data-routing path that
   after-hours testing can't rule out from thin volume alone.
`CHART_OPTIONS` additionally got an explicit Schwab-side rejection - see the 9b callout above.
**Bottom line: field indices are correct per Schwab's Streamer Guide, the request/subscribe path
works, but an actual live candle hasn't been observed end-to-end yet.** This needs a retest during
RTH with real volume before either side treats 9c as fully confirmed - will update this file right
after.

### 9d. Open question — answered (partially)

*"Does Schwab's `/pricehistory` reliably return same-day minute candles for a freshly-listed 0DTE
option contract from market open?"* — **not yet answered**, needs a live check during market
hours against a real freshly-listed 0DTE contract, which hasn't happened yet since 9a just landed
after close. Flagging back as still open rather than guessing — will confirm at the next market
open and update this section. If it turns out Schwab doesn't have same-day intraday history for a
same-day-listed contract (plausible — the contract didn't exist yet at Schwab's data-vendor level
until today), the practical workaround is simple: an OSI symbol representing a contract that
didn't exist before today has no "before" to backfill anyway, so the frontend chart for a newly
armed 0DTE contract should just start empty and fill in live via `chart-candle` rather than
expecting backfill to produce anything — worth building for that as the safe default regardless
of how the live check turns out.

### 9e. Acceptance checks — status

All four implemented; status against preprod after live testing on 2026-09-02 (after-hours):
1. `price-history` 200 + non-empty candles during RTH — **✅ live-verified** (see 9a, 726 candles,
   though that specific test ran after-hours against *today's already-closed* session, not live
   RTH - worth a same-day-during-RTH sanity check too, low risk given it's a straight Schwab proxy).
2. `chart-candle` (`EQUITY`) arriving within ~2min of a new bar after `subscribe-underlying` —
   **tested, not yet observed** (90s live window, zero `chart-candle` events despite a clean
   `CHART_EQUITY/SUBS` ack) - see 9c, likely after-hours volume, needs RTH retest.
3. `chart-candle` (`OPTION`) arriving after `subscribe-option-chart` — **tested, currently
   blocked**: `CHART_OPTIONS/SUBS` itself was rejected by Schwab (`code: 11`, "Service not
   available or temporary down") - see 9b. Needs RTH retest with a liquid 0DTE contract.
4. `subscribe-option-chart({ symbol: null })` stops option candles without killing the equity
   stream — implemented per 9b (independent SUBS/UNSUBS calls per symbol); the unsubscribe path
   itself works (confirmed via ack + logs), but since no candles were flowing yet from check 3
   there's nothing to confirm actually stops.

**All four need a market-hours (9:30am–4pm ET) retest before section 9 is fully closed out.**
Nothing wrong has been confirmed - price-history and the subscribe plumbing all work exactly as
specced - but live 1-minute candle delivery for both equity and (especially) options is still an
open question pending real trading-hours volume.

## 8b. ~~Bug~~ RESOLVED: option ladder thrashing (`LEVELONE_OPTIONS` churn, blank chain) — 2026-09-03

Distinct from the item 8 streamer crash-loop above (that one killed the whole socket; this one
left the socket healthy but the option ladder subscription unstable). Frontend reported the
options chain rendering completely blank during RTH. Root cause: `recenterLadder()` rebuilt the
entire 16-strike `LEVELONE_OPTIONS` window any time the nearest whole-dollar strike changed by
even $1, with zero hysteresis. Spot price hovering right at a strike boundary (e.g. SPY bouncing
$565.99 ↔ $566.01) flips the rounded "nearest strike" back and forth on every tick, so the
backend was issuing a full `UNSUBS`/`SUBS` cycle for the shifting edge strikes every 1–8 seconds —
confirmed live via preprod logs, ~300 churn events across a 13-minute window right after market
open. The at-the-money symbols the frontend cares about most were being torn down and
re-subscribed before Schwab ever got a chance to stream a quote for them, which is what made the
chain render blank (not a frontend rendering bug, and not a connection/auth problem — `stream-
status` stayed `connected: true` the whole time).

**Fixed**: added real hysteresis — the ladder now only rebuilds once the nearest strike has
drifted **3 strike increments** away from the current center (or on an actual day rollover), not
on every single-increment change. Extracted into a small pure/unit-tested helper
(`shouldRecenterLadder` in `ladder-recenter.util.ts`) rather than inline math, specifically so this
class of bug is covered by tests going forward. Deployed to preprod + prod. **Live-verified**:
zero `LEVELONE_OPTIONS` churn events in a 2.5-minute post-deploy log window that previously showed
dozens of events in a comparable span. **No frontend action needed** — this was entirely a
backend streamer bug; the chain should populate normally now. Worth a fresh live sanity check on
your end now that it's redeployed, but nothing to change client-side.

## 10. Broker stop-loss + working orders (chart drag-to-stop) — **implemented 2026-09-02**

Implements the frontend's section 10 ask in full: `fast-execute` extended with `STOP`/
`STOP_LIMIT` (10a), `GET .../orders/working` (10b), cancel via `DELETE .../orders/:orderId`
(10c — cancel+re-place chosen over a separate replace endpoint, per the doc's own "cancel+re-place
is enough for v1"), and the optional `order-update` socket event (10d, see section 4). Paper
trading stays entirely frontend-side, as scoped (10e) — no backend surface for it.

### 10a. `fast-execute` — additive `STOP`/`STOP_LIMIT`

Chosen path: **extended the existing `fast-execute`** rather than a new `/orders/stop` endpoint,
per the doc's stated preference. `LIMIT`/`MARKET` behavior is unchanged (verified via existing
`marketable-limit.util` tests, which only special-case `LIMIT`). See the request/response shape
under section 3 above — `stopPrice` maps straight through to Schwab's own `stopPrice` field,
`price` on a `STOP_LIMIT` maps to Schwab's limit leg untouched (no marketable-limit walk applied —
that's only meaningful for a plain `LIMIT` order chasing a fill right now).

**Validation implemented exactly as asked** (`FastOrderDto`):
- `STOP`/`STOP_LIMIT` without `stopPrice` → `400` (`class-validator`, same error shape as section 3).
- `STOP_LIMIT` without `price` → `400`.
- `LIMIT` still requires `price`; `MARKET` requires neither. `stopPrice` is simply ignored
  (no validation error) if sent on a `LIMIT`/`MARKET` order.
- `orderId` is now returned on every `fast-execute`/`flatten`/`reverse` response, parsed from
  Schwab's `Location` response header (`.../orders/{orderId}`) — `null` if Schwab didn't return one.

Session/duration: same as every other order type — Schwab `session: 'NORMAL'`,
`duration: 'DAY'`. Nothing 0DTE-specific needed there.

### 10b. `GET /api/v1/subapps/schwab/orders/working?accountHash=<hash>`

```ts
Array<{
  orderId: string
  symbol: string
  instruction: string
  quantity: number
  filledQuantity: number
  orderType: string // 'STOP' | 'STOP_LIMIT' | 'LIMIT' | 'MARKET' | ...
  status: string // WORKING | QUEUED | PENDING_ACTIVATION | ACCEPTED (whatever Schwab's still-open statuses are)
  price: number | null
  stopPrice: number | null
  enteredTime: string | null
}>
```

Implemented as a thin proxy to Schwab's `GET .../accounts/{accountHash}/orders`, windowed to
local midnight→now (Schwab requires an explicit `fromEnteredTime`/`toEnteredTime` on this
endpoint — a full day easily covers any 0DTE order), then filtered client-side to just the
still-resting statuses (Schwab's `status` filter only accepts one value at a time, so "working"
is computed here rather than asked of Schwab directly). Same auth/rate-limit guard as the rest of
`/orders/*` (section 3).

### 10c. Cancel — `DELETE /api/v1/subapps/schwab/orders/:orderId?accountHash=<hash>`

```ts
// -> { status: 'CANCELED'; statusCode: number }
```

Thin proxy to Schwab's `DELETE .../accounts/{accountHash}/orders/{orderId}`. **No separate
replace/PUT endpoint** — trailing a stop is cancel this endpoint, then `fast-execute` again with
the new `stopPrice`, exactly the "cancel+re-place is enough for v1" option the doc offered.
`orderId` for the cancel call should come from the `orderId` on the original `fast-execute`
response (10a) when available, falling back to a `GET .../orders/working` lookup otherwise.

### 10d. `order-update` socket event — implemented (optional ask, shipped anyway)

See section 4 for the full payload shape. Backend-wide poll (not per-socket), same pattern as
`account-snapshot`, diffing against the previous poll so it only broadcasts on an actual change
(new order, status change, fill, or stop/limit price change) rather than every poll tick.
`averageFillPrice` is a quantity-weighted average across Schwab's `orderActivityCollection`
execution legs, so it's accurate through partial fills too — `null` until the first fill.

### 10f. Acceptance checks — status

1. `fast-execute` with `orderType: 'STOP'`, `SELL_TO_CLOSE`, `stopPrice` → 2xx, order appears in
   `GET .../orders/working` as `WORKING` (or equivalent pre-trigger status) — **implemented, not
   yet live-tested against a real Schwab order** (needs RTH + an open option position to place a
   real protective stop against; unit tests cover the DTO validation and payload-building logic,
   see `fast-order.dto.spec.ts` / `working-order.mapper.spec.ts`).
2. Premium trades through `stopPrice` → position flattens, `account-snapshot` reflects flat, and
   `order-update` fires `FILLED` — **not yet live-tested**, same reason as (1).
3. Cancel working stop → gone from `GET .../orders/working`, position still open — **implemented,
   not yet live-tested**.
4. Trail (cancel old + place new) → only one working `STOP` for that symbol — **implemented as
   cancel+re-place per 10c**; frontend is responsible for the cancel-then-place sequencing itself
   (no atomic replace on this side), not yet live-tested end-to-end.
5. Existing `MARKET`/`LIMIT` `fast-execute` + `flatten` unchanged — **✅ verified**: full test
   suite (including pre-existing `marketable-limit.util.spec.ts`) passes unmodified, and the new
   `orderType`-conditional payload branches leave the `LIMIT`/`MARKET` code paths untouched.

**Bottom line: section 10 is code-complete and deployed, mirroring section 9's rollout pattern —
all five acceptance checks need a live RTH retest against a real resting order before this is
fully closed out**, same caveat as section 9's live-candle checks.

## 7. Git remote / CI, sign-up UI
Both resolved on the frontend side — GitHub repo + Netlify push-to-deploy wired up, and a Sign In
/ Create Account toggle shipped on `/sign-in`. No backend action needed.

---

## Open items — status

Current state:
1. Streamer **tick** field mappings (`option-ticks`) — still open, blocked on an open option
   position generating live ticks (see section 6).
2. **Section 9 (chart backfill + live candles) is implemented and deployed, partially
   live-verified**:
   - 9a (`price-history`) — **✅ fully live-verified** (726 real SPY candles from preprod).
   - `subscribe-option-chart`/`subscribe-underlying` request plumbing (acks, no crash on Schwab
     rejection) — **✅ live-verified**.
   - Actual `chart-candle` delivery (9c), for both `EQUITY` and `OPTION` — **not yet observed**,
     tested after-hours only. `CHART_OPTIONS` was explicitly rejected by Schwab
     (`code: 11, "Service not available or temporary down"`) in that after-hours test; `CHART_EQUITY`
     was accepted but produced no candle in a 90s window. Likely just after-hours/thin-volume
     behavior (matches today's separate finding that 0DTE options have no after-hours session at
     all) but **not confirmed** — needs a retest during regular market hours (9:30am–4pm ET). See
     section 9b/9c/9e for full detail. Will update this file immediately after that retest.
   - 9d (same-day 0DTE history question) — still open, same reason.
3. Everything else (auth contract, CORS, OAuth connect, orders/accounts/positions, account
   balances, all four reported bugs including the streaming crash loop) — confirmed live on
   preprod and prod.
4. **Section 10 (broker stop-loss + working orders, chart drag-to-stop) is implemented and
   deployed, not yet live-tested**:
   - `fast-execute` extended with `STOP`/`STOP_LIMIT` + `stopPrice`, returns `orderId` — **code
     complete, unit-tested** (DTO validation + payload building), **not yet placed against a real
     Schwab order**.
   - `GET .../orders/working` and `DELETE .../orders/:orderId` — **code complete**, same
     not-yet-live-tested caveat.
   - `order-update` socket event (optional ask, shipped) — **code complete**, same caveat.
   - Needs an RTH retest with a real open option position to close out all five of section 10f's
     acceptance checks — see section 10.

## Changelog

- **2026-09-03 (bug fix: option ladder thrashing / blank options chain)**: Frontend reported the
  options chain rendering completely blank during RTH. Root-caused via live preprod logs to
  `recenterLadder()` rebuilding the entire 16-strike `LEVELONE_OPTIONS` subscription any time the
  rounded nearest-strike changed by even $1, with no hysteresis — SPY hovering at a whole-dollar
  boundary flipped the nearest strike back and forth every tick, producing ~300 `UNSUBS`/`SUBS`
  churn events in a 13-minute window and tearing down the at-the-money symbols before Schwab could
  ever stream a quote for them. Fixed by requiring a 3-strike-increment drift before rebuilding
  (extracted into a unit-tested `shouldRecenterLadder` helper). Deployed to preprod + prod,
  live-verified: zero churn events in a 2.5-minute post-deploy window. Pre-existing bug, unrelated
  to section 10 — see section 8b for the full writeup. **No frontend action needed.**
- **2026-09-02 (broker stop-loss + working orders — section 10 implemented)**: Built the full
  contract the frontend asked for to support chart drag-to-stop on live trades: extended
  `fast-execute`'s `FastOrderDto`/`OrderType` with `STOP`/`STOP_LIMIT` + `stopPrice` (chose to
  extend the existing endpoint over a new `/orders/stop`, per the doc's stated preference),
  now returns `orderId` (parsed from Schwab's `Location` response header) on every
  `fast-execute`/`flatten`/`reverse` response so the frontend can cancel/replace without an extra
  round trip. Added `GET .../orders/working` (thin proxy to Schwab's orders endpoint, windowed to
  today, filtered to still-resting statuses) and `DELETE .../orders/:orderId` to cancel — chose
  cancel+re-place over a separate PUT replace endpoint for trailing, per the doc's own "cancel+
  re-place is enough for v1." Also shipped the optional `order-update` socket event (10d): a
  backend-wide poller (same shape as `AccountSnapshotService`) that diffs Schwab's orders against
  the previous poll and only broadcasts on an actual status/fill/price change, including a
  quantity-weighted `averageFillPrice` across partial fills. New unit tests
  (`fast-order.dto.spec.ts`, `working-order.mapper.spec.ts`) cover the DTO validation rules and
  payload-building/mapping logic; full existing test suite + `tsc`/`eslint`/`nest build` all pass
  unmodified, confirming `LIMIT`/`MARKET` `fast-execute`/`flatten` behavior is unchanged. Deployed
  to preprod + prod. **Not yet live-tested against a real Schwab order** — needs an RTH retest
  with an open option position to close out section 10f's five acceptance checks; will update this
  file after that retest, same as section 9's live-candle checks. See section 10 for the full
  contract as implemented and open items for status.
- **2026-09-02 (chart backfill + live candle streaming — section 9 implemented)**: Built the full
  chart contract the frontend asked for: `GET .../market-data/price-history` (thin authenticated
  proxy to Schwab's `/pricehistory`, normalized response, 60/60s rate limit), `subscribe-option-chart`
  client→server event (shared tracked-option `CHART_OPTIONS` subscription, last-request-wins,
  independent of the underlying), automatic `CHART_EQUITY` subscription piggybacked onto every
  `subscribe-underlying` call (no new client event needed for the underlying's own chart), and
  `chart-candle` server→client broadcasts for both asset types using Schwab's documented field
  maps. Also hardened the option-chart subscription to survive a backend-side streamer reconnect
  (re-armed automatically on re-login, matching how the equity quote/chart subscriptions already
  behaved). Deployed to preprod + prod; local module-wiring verified (no DI/circular-dependency
  issues, learned the hard way from the auth/http module cycle earlier).
- **2026-09-02 (chart contract — live test results, after-hours)**: Ran a full live test against
  preprod right after deploying section 9: `price-history` (9a) came back **✅ fully verified** —
  a real `200` with 726 one-minute SPY candles for the day. The socket side (9b/9c) is partially
  verified: `subscribe-underlying`/`subscribe-option-chart` acks work, and — importantly — a
  Schwab-side rejection of `CHART_OPTIONS/SUBS` (`code: 11, "Service not available or temporary
  down"`) did **not** crash the streamer or trigger the old flapping bug, confirming today's
  earlier robustness fixes hold up under a new kind of error too. But no actual `chart-candle`
  event arrived for either `CHART_EQUITY` (SPY, accepted with no error) or `CHART_OPTIONS`
  (rejected) in a 90-second window. Most likely explanation is thin/zero after-hours volume at
  ~7:40pm ET (consistent with today's separate finding that options have no after-hours session
  at all) rather than a code bug — Schwab's own field docs confirm `CHART_EQUITY` is supposed to
  update in extended hours too, so this needs a market-hours retest to actually confirm, not just
  a plausible excuse. **Section 9 is not being marked fully done until that retest happens** — see
  section 9 and "Open items" for the precise breakdown of what's confirmed vs. still open.
- **2026-09-02 (after-hours behavior + 0DTE day-rollover fix)**: After the streaming fix below,
  frontend asked why no option prices were showing at ~6:30pm ET. Confirmed live: this is expected,
  not a bug — equity **options** have no after-hours session (unlike SPY/QQQ/IWM itself, which
  keeps ticking `underlying-price` for a while after the 4pm close), so no market maker quotes
  those contracts again until the next session opens. `stream-status` stayed `connected: true` the
  whole time; it's genuinely just a quiet market. This surfaced a related latent bug though: the
  ladder only rebuilt its 16-strike window when price drifted a full strike, with no awareness of
  the calendar day changing — since today's 0DTE contracts expire at today's close, if price didn't
  happen to drift a full point overnight, the backend would've stayed subscribed to yesterday's
  now-dead symbols indefinitely (a market open, `connected: true`, but permanently-expired-contract
  version of the exact same "no data" symptom). Fixed: the streamer now tracks which expiration
  date the current window was built for and forces a full rebuild the moment the date rolls over —
  checked reactively on the next equity tick and proactively every 5s using the last known price, so
  it doesn't depend on price movement or on equity ticks continuing to arrive overnight. Deployed to
  preprod + prod. **No frontend action needed** — real ticks should just start flowing again at the
  next market open (9:30am ET) against the correct new expiration date; worth a quick sanity check
  then but nothing to build for.
- **2026-09-02 (streaming crash-loop bug fix — the `stream-status` flapping / zero ticks report)**:
  Frontend reported (with raw socket.io frame evidence) `stream-status` flapping `true`→`false`
  within ms on a tight ~2.6s loop, zero `ladder-recentered`/`option-ticks`/`underlying-price` over
  a 33s window despite a successful `subscribe-underlying` ack, and `account-snapshot` seemingly
  stuck on stale data. Root cause, found via new close-code/response-error logging added to the raw
  Schwab streamer connection: **every subscription request (`SUBS`/`UNSUBS`) was missing the
  `SchwabClientCustomerId`/`SchwabClientCorrelId` fields Schwab requires on every request, not just
  `LOGIN`.** `sendLoginRequest` built its own request object with those fields; every other command
  (the equity quote and option ladder subscriptions) went through a shared `sendRequest()` helper
  that never attached them. Schwab responded to the malformed `SUBS` with
  `{"code":21,"msg":"Bad command formatting"}` and then closed the socket outright — so the
  sequence was always connect → login succeeds → first `SUBS` gets rejected → connection killed →
  reconnect after 2s → repeat forever. That's exactly the flapping loop and exactly why no ladder
  or ticks ever arrived (the connection never survived past the first subscription). Fixed by
  attaching both fields to every outgoing request inside `sendRequest()` itself, so no future
  caller can hit the same bug. **Live-verified after the fix**: connection has held stable with
  zero reconnects/errors, and a direct socket capture against preprod over 30s showed continuous
  real data — 30 `option-ticks` batches with live bid/ask/last, 23 `underlying-price` ticks (SPY
  moving tick-by-tick), and 7 `account-snapshot` broadcasts. Also investigated the "stale
  `account-snapshot`" half of the report: confirmed via temporary logging that the balance poll was
  never cached/stale — it's genuinely live-polling Schwab every cycle. There's still only one
  Schwab account linked (`GET /orders/accounts` returns exactly one), so the ~$4.99 balance you're
  seeing is that same account's real current balance, not a different "old test account" bleeding
  through — there was never a second account connected. Additionally fixed a related gap while in
  there: a client connecting after the streamer had already stabilized got neither
  `stream-status` nor `ladder-recentered` until the next actual change (which could look identical
  to this same bug for anyone reconnecting later) — `OptionsGateway` now replays both immediately
  on connect. Deployed and live-verified on preprod, merged to prod too (prod has no account
  connected yet, but the fix is in place for whenever it does). **No frontend action needed.**
- **2026-09-02 (`/auth/status` `accountHash` + connection-death bug fix)**: Frontend reported
  `accountHash: null` on `/auth/status` despite `connected: true` (worked around client-side with a
  fallback to `GET /orders/accounts`, which is fine to keep), and separately flagged that
  `expiresAt` looked already in the past relative to the response's own `Date` header right after
  connecting. Backend investigated the second one and found something much bigger: the Schwab
  connection was actually **dead** — every scheduled refresh attempt in the preprod logs was
  failing with `invalid_grant` ("refresh token is invalid, expired or revoked"). Root cause: this
  backend's `getValidAccessToken()` is called independently by *every* outgoing Schwab HTTP request
  (the Bearer interceptor — including `AccountSnapshotService`'s ~4s poll) and by the raw
  streamer's reconnect path, with no coordination between them. When two of those landed in the
  same near-expiry window, each redeemed the *same* refresh_token concurrently — Schwab (like most
  OAuth providers) rotates the refresh token on every use and revokes the whole token family if it
  detects the same one reused, which is exactly what killed the connection. Compounding bug: the
  OAuth callback handler always inserted a fresh DB row instead of reusing the existing one, so
  three orphaned rows had piled up and the "get the current token" query could non-deterministically
  read a stale, already-dead one instead of the latest. Fixed all three: a single-flight lock so
  only one refresh is ever in flight backend-wide, the callback handler now reuses the existing row,
  and `/auth/status.accountHash` now resolves the same dynamic way `GET /orders/accounts` does
  instead of an always-unset config var. Also: a refresh that fails with `invalid_grant` now clears
  the stored token immediately, so `connected` correctly flips to `false` right away instead of
  lying for up to 7 days. Deployed to both preprod and prod; preprod's connection is healthy again
  (verified a live refresh succeeded in place, `/auth/status` returns a real `accountHash`, no
  further `invalid_grant`s in ~10+ min of log monitoring spanning a refresh cycle). **No frontend
  action needed** — your `GET /orders/accounts` fallback is harmless to keep, and `connected: false`
  going forward is now trustworthy enough to just show a "reconnect" prompt on.
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
