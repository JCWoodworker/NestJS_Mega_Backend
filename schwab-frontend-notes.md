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

🐛 **Bug fix (2026-09-03): blank options chain — two separate bugs, both now fixed.** Frontend
reported the options chain rendering completely empty during RTH right after the section 10 work
landed above. This turned out to be **two independent, unrelated bugs stacked on top of each
other**, both pre-existing and both now fixed and redeployed to preprod + prod:
1. A subscription-churn bug in the option ladder's re-centering logic (fixed first, confirmed zero
   `LEVELONE_OPTIONS` churn afterward) — see the Changelog and section 8b.
2. **The chain was still blank after that fix.** Root cause: `option-ticks` field mislabeling — an
   off-by-one in `LEVELONE_OPTIONS`'s field numbering vs. equities meant `bid`/`ask`/`last` were
   being read from field numbers that are essentially never populated, even though real ticks were
   flowing the entire time (confirmed via a direct socket probe: 769 ticks/25s with genuine bid/ask/
   last movement). **This is what was actually causing the all-`--` chain** — see the Changelog for
   the full root cause and **the breaking `option-ticks` contract change** in section 4 that fixes
   it (raw field numbers are gone; ticks are now pre-normalized to named fields server-side).

🔴 **BLOCKER fixed (2026-09-03): chunked `SUBS` was wiping most of the option ladder subscription
(frontend's open item 12 / section 11).** Frontend reproduced 3/3 that only 6 of 32 ladder symbols
ever received `option-ticks` — every near-the-money strike was permanently silent, so a hard
refresh rendered the *entire* option chain `--` with no REST fallback. Root cause matched the
frontend's own diagnosis: the ladder's `LEVELONE_OPTIONS` subscribe/recenter path issued growing
symbol sets as a single Schwab `SUBS` request, and Schwab's `SUBS` semantics (or an undocumented
size limit on a long `SUBS` request — either is consistent with the evidence) meant most of that
34-symbol batch never actually registered. **Fixed**: subscribe/recenter now sends small `ADD`
batches (never a bare multi-symbol `SUBS`) — see section 11 and the Changelog. Deployed to preprod
+ prod. **No frontend action needed** — same `option-ticks`/`ladder-recentered` contract, just
reliable now.

🐛 **Bug fix (2026-09-03): `chart-candle` OHLCV shifted by one field (frontend's open item 11 /
section 9c).** Same bug family as the option-tick mislabeling above, this time in `CHART_EQUITY`:
a raw frame captured live on preprod confirmed field `1` is `Sequence` (not `Open`), shifting
open/high/low/close/volume down by one and producing structurally impossible bars (`low > high`).
**Fixed** — see section 9c and the Changelog. Deployed to preprod + prod.

✅ **New (2026-09-03): `dayStartEquity` added to `account-snapshot` (frontend's open item 13 /
section 12)** and **✅ new option-chain quote snapshot endpoint,
`GET .../market-data/chain` (frontend's open item 14 / section 11b)** — both implemented per the
frontend's asks, see sections 12 and 11b.

✅ **New (2026-09-03): Daily P&L tracking + trade/transfer history (section 13).** Backend now
persists Schwab transactions, separates capital transfers from trading P&L, FIFO-matches fills into
per-trade realized P&L, rolls up daily equity/P&L, and keeps terminal order history. New REST
surface under `/api/v1/subapps/schwab/pnl/*` — see section 13. Frontend history page is the next
consumer of this contract.

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
- **`option-ticks`** — batched array, ~50ms throttle. **⚠️ Breaking change from the previous copy of
  this file (2026-09-03) — see the "option-ticks field mislabeling" changelog entry for why.** The
  raw Schwab field-number object (`OptionTickRaw` below) is gone; the backend now normalizes every
  tick into named fields server-side, so there's no field-number table to cross-reference anymore:
  ```ts
  type OptionTick = {
    symbol: string // matches the OSI-format strings in ladder-recentered's `symbols` array
    bid?: number
    ask?: number
    last?: number
    bidSize?: number
    askSize?: number
    volume?: number
    openInterest?: number
    delta?: number
  }
  ```
  Schwab's delivery type for this stream is "Change" — **only fields that changed since the last
  tick for that symbol are present**, same as before. Merge each tick into per-symbol state by
  `symbol` rather than assuming every field is always populated; a field being `undefined` means
  "unchanged," not "zero." Live-verified against real preprod tick data 2026-09-03 (see changelog):
  769 ticks/25s on the current 0DTE SPY put/call ladder with sane bid/ask/last (e.g. `bid: 1.13,
  ask: 1.14, last: 1.14`) and a monotonically-increasing `volume`.
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
    dayStartEquity: number // new 2026-09-03 — see section 12
    positions: Array<{ symbol: string; assetType: string; quantity: number; averagePrice: number; marketValue: number; dayProfitLoss: number }>
    asOf: number
  }
  ```
  **Live-verified** — see section 6 for the real observed payload and a bug that was blocking
  this entirely until fixed. `dayStartEquity` is new (2026-09-03, frontend's open item 13) — see
  section 12 for the full writeup and where it's sourced from on Schwab's side.
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

~~**Still open**: streamer **tick** field-map indices~~ — **resolved 2026-09-03**. There was a
real off-by-one bug (see the "option-ticks field mislabeling" changelog entry); backend now emits
named fields and there's no index table left on either side.

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

### 9c. `chart-candle` (server → client) — delivery ✅ confirmed RTH, field-shift bug ✅ fixed

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

🐛 **Bug fixed 2026-09-03: `CHART_EQUITY` was mapped off by one field, matching the frontend's
report** (same bug family as the `option-tick` mislabeling in section 4/Changelog). The field map
this backend had - `0`=key, `1`=open, `2`=high, `3`=low, `4`=close, `5`=volume, `6`=sequence -
turned out to be wrong despite matching a third-party mirror of Schwab's docs. A raw frame
captured live on preprod during RTH settled it:
```json
{"1":311,"2":772.625,"3":772.67,"4":772.41,"5":772.438321,"6":71229,"7":1788451860000,"8":20699,"key":"SPY"}
```
Field `1` (311) is far too small to be a SPY price and matches a monotonic per-session minute
counter (Sequence, not Open); treating `2..5` as open/high/low/close and `6` as volume instead
produces a fully self-consistent bar (`low <= open/close <= high`, volume a plausible 1-minute
share count) - exactly the "map fields 2-6" fix the frontend suggested.

**Fixed field map** (`chart-fields.ts`):
- `CHART_EQUITY`: `0`=key, `1`=sequence, `2`=open, `3`=high, `4`=low, `5`=close, `6`=volume,
  `7`=chartTime, `8`=chartDay.
- `CHART_OPTIONS`: **unchanged**, `0`=key, `1`=chartTime, `2`=open, `3`=high, `4`=low, `5`=close,
  `6`=volume - this one already put `open` at field `2` (not `1`), so it doesn't appear to carry
  the same off-by-one. Structurally consistent, but **not yet independently confirmed against a
  live raw `CHART_OPTIONS` frame** (no option-chart subscriber was active during the investigation
  that caught the `CHART_EQUITY` bug) - flagging as believed-correct rather than verified.

Also added a **runtime `low <= high` sanity guard** (`isSaneCandle` in the new
`chart-candle.mapper.ts`, unit-tested) that drops and logs a warning for any bar that's still
structurally impossible after mapping, rather than emitting it - a safety net against this exact
class of bug shipping silently again, independent of the frontend's own client-side guard.
Deployed to preprod + prod. **No frontend action needed** for the fix itself - same
`ChartCandlePayload` shape, just correct now. The frontend's client-side `isSaneCandle` guard
(`src/lib/candles.ts`) is safe to keep as defense-in-depth; it should simply stop triggering.

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

Updated 2026-09-03 after an RTH retest (superseding the after-hours-only results from 2026-09-02):
1. `price-history` 200 + non-empty candles during RTH — **✅ live-verified** (see 9a, 726 candles).
2. `chart-candle` (`EQUITY`) arriving within ~2min of a new bar after `subscribe-underlying` —
   **✅ live-verified RTH 2026-09-03** - candles arrive ~1/min. Field values were shifted by one
   (see the bug fix above) but delivery itself was confirmed working; both delivery and field
   correctness are now confirmed.
3. `chart-candle` (`OPTION`) arriving after `subscribe-option-chart` — **still open**. The
   after-hours `code: 11` rejection from 2026-09-02 was not re-observed as an error during the RTH
   session, but no option candle was captured in the investigation window either (no live
   subscriber was actively watching for one at the time) - needs a dedicated RTH retest with a
   liquid 0DTE contract to confirm both delivery and the `CHART_OPTIONS` field map.
4. `subscribe-option-chart({ symbol: null })` stops option candles without killing the equity
   stream — implemented per 9b (independent SUBS/UNSUBS calls per symbol); still unconfirmed end
   to end pending check 3.

**Equity chart-candle (checks 1-2) is now fully closed out. Option chart-candle (checks 3-4)
still needs an RTH retest** - lower priority than the items above since it wasn't part of the
frontend's latest priority list, but flagging so it doesn't get lost.

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

## 11. ✅ Fixed: chunked `SUBS` wiping most of the option ladder subscription

Frontend reproduced 3/3 during RTH that only 6 of the 32 `LEVELONE_OPTIONS` ladder symbols ever
received `option-ticks` — the 26 silent ones were every near-the-money strike, i.e. the only ones
anyone actually trades, while the trailing 6 (furthest OTM, a contiguous slice) ticked normally.
No subscription churn to explain it (one stable ladder, one recenter event for the whole window).
Cross-checked against Schwab's own `price-history` for one of the silent symbols — it had traded
~4k times in a single minute while delivering zero ticks — ruling out thin market activity as an
explanation. **Escalated to a blocker**: since the ladder paints purely from `option-ticks`, a
hard refresh throws away the cached values and the silent symbols never send a replacement, so the
*entire visible chain* renders `--` and the app can't be traded from after a reload, with no REST
fallback available at the time (see section 11b for the fix to that gap too).

**Root cause matched the frontend's own diagnosis**: subscribing/growing the ladder issued a
single Schwab `SUBS` request listing every new symbol's key in one comma-separated string.
Schwab's Streamer Guide is explicit that `SUBS` **replaces** the entire subscription set for a
service, while `ADD` appends without wiping (and is documented as fine to use even for the very
first subscription). Whether the precise failure mode was `SUBS`'s replace semantics interacting
with something else, or an undocumented limit on a long single request's `keys` string, the fix is
the same either way and removes the ambiguity entirely.

**Fixed**: `SchwabStreamerService` no longer sends a bare multi-symbol `SUBS` to grow the ladder.
Both the initial subscribe and every recenter now split the symbol list into small chunks (8 per
request, `OPTIONS_SUBSCRIBE_CHUNK_SIZE` in `ladder-recenter.util.ts`) and send each chunk as its
own `ADD` request; removals are similarly chunked `UNSUBS` calls. Applied consistently to
`recenterLadder()` and to the full-ladder teardown on `switchUnderlying()`. New unit tests
(`chunkArray` in `ladder-recenter.util.spec.ts`) cover the chunking boundaries (exact multiples,
remainders, empty input). Deployed to preprod + prod. **No frontend action needed** — same
`option-ticks`/`ladder-recentered` contract as before, just reliably covering the full ladder now.
Would appreciate a rerun of `scripts/tick-coverage.mjs` to confirm distinct-symbols-ticked now
equals ladder size during RTH.

### 11b. ✅ Implemented: option-chain quote snapshot endpoint

```
GET /api/v1/subapps/schwab/market-data/chain?symbol=SPY&strikeCount=16&symbols=<comma-separated OSI list>
```

Requires the same `Authorization: Bearer <accessToken>` as the rest of `/orders/*`/`market-data/*`.
`symbol` is required (underlying ticker); `strikeCount` is optional (defaults to 16, matching the
ladder's own window size); `symbols` is optional — pass the exact array from `ladder-recentered` to
filter the response down to just that ladder rather than everything Schwab returns.

```ts
Array<{
  symbol: string        // OSI, same padding as ladder-recentered
  bid: number | null
  ask: number | null
  last: number | null
  bidSize: number | null
  askSize: number | null
  volume: number | null
  delta: number | null
}>
```

Thin proxy to Schwab's `GET /marketdata/v1/chains`, restricted to **today's expiration only**
(`fromDate`/`toDate` = today) to match this app's 0DTE-only ladder — same date the streamer itself
subscribes against. Flattens Schwab's `callExpDateMap`/`putExpDateMap` structure into one array
(`mapOptionChainResponse` in `option-chain.mapper.ts`, unit-tested). Missing/non-numeric fields
come back as `null` rather than `0` or omitted, matching this endpoint's own explicit nullable
contract (deliberately different from `option-ticks`' "omitted = unchanged" partial-update
semantics, since a snapshot has no previous tick to diff against). Call on mount and on
reconnect, then let `option-ticks` take over, per the original ask. Deployed to preprod + prod —
**not yet live-tested against a real chain response** (needs an RTH request against the connected
account; error handling/shape are implemented and unit-tested, but a live 200 hasn't been observed
yet).

## 12. ✅ Implemented: `dayStartEquity` on `account-snapshot`

Frontend's Day P&L was reading `$0.00` on a profitable day because `positions[].dayProfitLoss`
only covers currently-open positions — closing a winning trade removes it from the array and
takes its P&L with it. Schwab's account response already carries `initialBalances` (distinct from
`currentBalances`, which the existing `equity` field reads) — the start-of-day account value.

**Implemented**: `account-snapshot` (section 4) now includes `dayStartEquity: number`, read from
`initialBalances.liquidationValue`, falling back to `initialBalances.accountValue` if the former
is absent (cash accounts may not have a `liquidationValue`), defaulting to `0` only if
`initialBalances` itself is missing entirely. Frontend can now compute
`dayPnl = equity - dayStartEquity`, which covers realized *and* unrealized P&L and survives page
reloads, without needing the client-side baseline-capture/manual-override workaround. New unit
tests (`account-data.mapper.spec.ts`) cover both the `liquidationValue` and `accountValue`
fallback paths plus the all-missing default. Deployed to preprod + prod, but **not yet
live-verified against a real non-zero `initialBalances`** — the connected test account's exact
`initialBalances` shape hasn't been captured live yet, so the `liquidationValue`/`accountValue`
fallback order is based on Schwab's documented account-response schema, not a confirmed live
sample. The optional `realizedDayPnl` bonus ask wasn't added — didn't want to guess at a field
name without seeing a live response first; can add it once `dayStartEquity` itself is confirmed
against real data, if it turns out Schwab exposes something more direct.

## 13. ✅ Implemented: Daily P&L tracking + trade/transfer history

Backend-persisted history so the frontend can build a history page that answers: **how much did we
earn from trading vs how much did we transfer in?** Charts on the frontend should plot
`GET /pnl/daily` (equity curve) and overlay `GET /pnl/trades` markers on existing
`GET /market-data/price-history` candles — no extra chart endpoint here.

All endpoints require `Authorization: Bearer <accessToken>` (same as `/orders/*`). Optional
`accountHash` query/body falls back to the linked account when omitted.

### Model

- **Transfers** (`TRANSFER_IN` / `TRANSFER_OUT`) come from Schwab transaction types
  (`ACH_RECEIPT`, `WIRE_IN`, `CASH_RECEIPT`, `ACH_DISBURSEMENT`, `WIRE_OUT`, `CASH_DISBURSEMENT`,
  sign-dependent `ELECTRONIC_FUND`) plus **manual** rows you can POST for a starting-balance
  backfill that predates Schwab sync history.
- **Trading P&L (daily)** = `endEquity - startEquity - netTransfers` (America/New_York calendar day).
- **Per-trade realized P&L** = FIFO lot-matching on synced trade fills (options use the 100x
  multiplier when the symbol looks like OSI).
- **Order history** persists terminal statuses (`FILLED` / `CANCELED` / `REJECTED` / `EXPIRED` /
  `REPLACED`) from the existing `order-update` poller — `GET /orders/working` alone only shows
  live orders.

Sync runs on boot (~15s after start) and every 15 minutes (`POST /pnl/sync` for a manual kick).
Daily rows are upserted from the existing `account-snapshot` poll.

### Endpoints

```
GET  /api/v1/subapps/schwab/pnl/summary
GET  /api/v1/subapps/schwab/pnl/daily?from=YYYY-MM-DD&to=YYYY-MM-DD
GET  /api/v1/subapps/schwab/pnl/transactions?from=&to=&category=
POST /api/v1/subapps/schwab/pnl/transactions
PATCH /api/v1/subapps/schwab/pnl/transactions/:id   # MANUAL only
DELETE /api/v1/subapps/schwab/pnl/transactions/:id  # MANUAL only
GET  /api/v1/subapps/schwab/pnl/trades?from=&to=&symbol=
GET  /api/v1/subapps/schwab/pnl/orders?from=&to=&symbol=&status=
POST /api/v1/subapps/schwab/pnl/sync
```

**`GET /pnl/summary`**

```ts
{
  currentEquity: number
  totalTransfersIn: number
  totalTransfersOut: number
  netDeposits: number              // in - out
  allTimeTradingPnl: number        // currentEquity - netDeposits
  todayPnl: number                 // today's trading_pnl rollup
  asOfDate: string                 // YYYY-MM-DD (ET)
}
```

**`GET /pnl/daily`** — equity curve / daily bars

```ts
Array<{
  date: string                     // YYYY-MM-DD (America/New_York)
  startEquity: number
  endEquity: number
  netTransfers: number
  tradingPnl: number               // end - start - netTransfers
  realizedPnl: number              // sum of FIFO closed trades that day
}>
```

**`GET /pnl/transactions`** — ledger (transfers + trades + fees + income + other)

```ts
Array<{
  id: string
  category: 'TRADE' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'INCOME' | 'FEE' | 'OTHER'
  schwabType: string | null
  source: 'SCHWAB_SYNC' | 'MANUAL'
  netAmount: number
  symbol: string | null
  description: string | null
  transactionDate: string          // ISO
  note: string | null
}>
```

**`POST /pnl/transactions`** — manual starting point / correction

```ts
// body
{
  category: 'TRANSFER_IN' | 'TRANSFER_OUT' | 'INCOME' | 'FEE' | 'OTHER' | 'TRADE'
  amount: number
  date: string                     // ISO date
  note?: string
  symbol?: string
  description?: string
  accountHash?: string
}
```

Only `source: 'MANUAL'` rows can be `PATCH`ed / `DELETE`d.

**`GET /pnl/trades`** — FIFO-matched closed round trips

```ts
Array<{
  id: string
  symbol: string
  direction: 'LONG' | 'SHORT'
  quantity: number
  openPrice: number
  closePrice: number
  openedAt: string
  closedAt: string
  realizedPnl: number
  holdingMs: number
}>
```

**`GET /pnl/orders`** — terminal order history

```ts
Array<{
  id: string
  orderId: string
  symbol: string
  instruction: string
  orderType: string
  status: string
  quantity: number
  filledQuantity: number
  price: number | null
  stopPrice: number | null
  averageFillPrice: number | null
  enteredTime: string | null
  closedAt: string | null
}>
```

### Frontend acceptance sketch

1. Seed a starting balance: `POST /pnl/transactions` with `category: TRANSFER_IN` for funding that
   predates sync (or rely on Schwab-synced ACH/WIRE rows once they appear).
2. History page: summary header from `/pnl/summary`, equity chart from `/pnl/daily`, trade list from
   `/pnl/trades`, transfer ledger filtered with `category=TRANSFER_IN|TRANSFER_OUT`, order log from
   `/pnl/orders`.
3. `allTimeTradingPnl` should move with closed trades and **not** jump when you only deposit/withdraw.

## 7. Git remote / CI, sign-up UI
Both resolved on the frontend side — GitHub repo + Netlify push-to-deploy wired up, and a Sign In
/ Create Account toggle shipped on `/sign-in`. No backend action needed.

---

## Open items — status

Current state:
1. Streamer **tick** field mappings (`option-ticks`) — **✅ fixed and live-verified 2026-09-03**.
   Was mislabeled (an off-by-one vs. Schwab's real `LEVELONE_OPTIONS` field numbering — see
   Changelog), which is what made the options chain render all `--` even with a healthy streamer
   connection and real ticks flowing. Now emits pre-normalized named fields instead of raw field
   numbers — **this is a breaking payload-shape change, frontend needs to update its `option-ticks`
   handler** (see section 4 for the new contract).
2. **Section 9 (chart backfill + live candles) is implemented and deployed, mostly
   live-verified**:
   - 9a (`price-history`) — **✅ fully live-verified** (726 real SPY candles from preprod).
   - `subscribe-option-chart`/`subscribe-underlying` request plumbing (acks, no crash on Schwab
     rejection) — **✅ live-verified**.
   - `chart-candle` (`EQUITY`) delivery + field mapping — **✅ fully resolved 2026-09-03**:
     delivery confirmed RTH, and a field-shift bug (OHLCV mapped off by one, `low > high` observed)
     found + fixed — see section 9c and the Changelog. This was frontend's **open item 11**.
   - `chart-candle` (`OPTION`) delivery — **still open**, needs an RTH retest with an active
     subscriber. `CHART_OPTIONS`' field map is believed-correct (structurally consistent, unlike
     the equity map before its fix) but not yet independently confirmed against a live frame.
   - 9d (same-day 0DTE history question) — still open, needs a live check against a freshly-listed
     contract.
3. **🔴 Open item 12 / section 11 (chunked `SUBS` wiping the option ladder) — ✅ fixed
   2026-09-03.** Was a blocker: only 6 of 32 ladder symbols ever ticked, and a hard refresh
   rendered the entire option chain `--` with no fallback. Fixed by switching ladder
   subscribe/recenter to small chunked `ADD` requests instead of a bare multi-symbol `SUBS` — see
   section 11 and the Changelog. Deployed to preprod + prod.
4. **Open item 13 / section 12 (`dayStartEquity` on `account-snapshot`) — ✅ implemented
   2026-09-03.** See section 12. Deployed to preprod + prod, not yet live-verified against a real
   non-zero `initialBalances`.
5. **Open item 14 / section 11b (option-chain quote snapshot endpoint) — ✅ implemented
   2026-09-03.** `GET .../market-data/chain` — see section 11b. Deployed to preprod + prod, not
   yet live-tested against a real chain response.
6. Everything else (auth contract, CORS, OAuth connect, orders/accounts/positions, account
   balances, all reported bugs including the streaming crash loop and the option-tick/chart-candle
   field mislabels) — confirmed live on preprod and prod.
7. **Section 10 (broker stop-loss + working orders, chart drag-to-stop) is implemented and
   deployed, not yet live-tested**:
   - `fast-execute` extended with `STOP`/`STOP_LIMIT` + `stopPrice`, returns `orderId` — **code
     complete, unit-tested** (DTO validation + payload building), **not yet placed against a real
     Schwab order**.
   - `GET .../orders/working` and `DELETE .../orders/:orderId` — **code complete**. Frontend's
     working-orders panel exercises both against a real `WORKING` `LIMIT` order successfully; cancel
     hasn't yet been exercised against a real resting order.
   - `order-update` socket event (optional ask, shipped) — **code complete**, not yet exercised.
   - Needs an RTH retest with a real STOP order to close out the remaining section 10f acceptance
     checks — see section 10.
8. **Section 13 (daily P&L + transfer/trade history) — ✅ implemented 2026-09-03.** New
   `/pnl/*` REST surface + DB tables for transfers vs trading P&L, FIFO realized trades, daily
   rollups, and terminal order history. See section 13. Frontend history page still to be built
   against this contract; live verification of Schwab `/transactions` sync pending first RTH sync
   against the connected account.

## Changelog

- **2026-09-03 (daily P&L tracking + history — section 13)**: New `PnlModule` with Postgres tables
  (`schwab_transactions`, `schwab_trade_fills`, `schwab_realized_trades`, `schwab_daily_pnl`,
  `schwab_order_history`), Schwab transaction sync (cron + boot), FIFO realized-P&L matcher,
  daily equity rollup hooked into the existing `account-snapshot` poll (America/New_York day key),
  and terminal-order persistence from the existing `order-update` poller. REST:
  `GET /pnl/summary|daily|transactions|trades|orders`, `POST/PATCH/DELETE /pnl/transactions`
  (manual starting-balance / corrections), `POST /pnl/sync`. Separates capital transfers from
  trading P&L (`allTimeTradingPnl = currentEquity - netDeposits`). Unit-tested classification,
  FIFO matcher (long/short/partial/options multiplier), daily formula, and ET date helpers. See
  section 13.
- **2026-09-03 (four items from a frontend session: blocker fix + 3 asks/fixes)**: Frontend sent
  four prioritized items from a live testing session (frontend's sections 11/11b/12/9c). All four
  addressed same-day:
  1. **🔴 Blocker — chunked `SUBS` wiping the option ladder (open item 12 / section 11)**: fixed by
     switching to small chunked `ADD` requests for subscribe/recenter, never a bare multi-symbol
     `SUBS`. New `chunkArray`/`OPTIONS_SUBSCRIBE_CHUNK_SIZE` util, unit-tested. See section 11.
  2. **`chart-candle` OHLCV field shift (open item 11 / section 9c)**: root-caused with a raw-frame
     capture on preprod (same technique used for the earlier option-tick mislabel) - confirmed
     `CHART_EQUITY` field `1` is `Sequence`, not `Open`; fixed field map to `2..6` = OHLCV. New
     `chart-candle.mapper.ts` with a runtime `low <= high` sanity guard, unit-tested. See section 9c.
  3. **`dayStartEquity` on `account-snapshot` (open item 13 / section 12)**: added, sourced from
     Schwab's `initialBalances.liquidationValue`/`accountValue`. See section 12.
  4. **Option-chain quote snapshot endpoint (open item 14 / section 11b)**: added
     `GET .../market-data/chain`, thin proxy to Schwab's `GET /marketdata/v1/chains`, flattened to
     the same shape `option-ticks` uses. See section 11b.

  All four deployed to preprod + prod same-day. Items 2-4 are implemented but not yet live-verified
  against real non-trivial data (need an RTH chain response, a non-zero `initialBalances`, and a
  live `CHART_OPTIONS` frame respectively) - flagged individually in "Open items" above. Item 1 (the
  blocker) is deployed and should be reverified with the frontend's own `scripts/tick-coverage.mjs`
  repro.
- **2026-09-03 (bug fix: `option-ticks` field mislabeling — the *actual* remaining cause of the
  blank options chain)**: After the ladder-thrashing fix below shipped, frontend reported the chain
  was *still* all `--` with a live position on the line. Confirmed via a direct socket probe against
  preprod (signed in, subscribed, listened for 25s) that real ticks *were* flowing the whole time —
  769 `option-ticks` batches with genuine bid/ask/last movement and a monotonically-increasing
  volume counter — so this was never a connectivity/streamer problem. The bug was in how those ticks
  were labeled: `LEVELONE_OPTIONS` has a "Description" field at index 1 that `LEVELONE_EQUITIES`
  doesn't, which shifts every price/size field up by one (bid=2 not 1, ask=3 not 2, last=4 not 3,
  total volume=8 not 9, bid/ask size=16/17 not 4/8). This backend's internal field map — and the
  `OptionTickRaw` contract previously documented in section 4 below — copied the equities numbering
  onto options unchanged, so the frontend was reading `bid`/`ask`/`last` from field numbers that are
  virtually never present in a real tick (field 1 only ever appears once, as a *string* description,
  on a symbol's very first snapshot). Every batch after that landed with those keys simply absent,
  which is indistinguishable from "no data" — exactly the all-`--` symptom, on every option, the
  entire time, regardless of how healthy the streamer connection was. Verified the correct numbering
  against Schwab's own published Streamer Guide field table (independently corroborated by two other
  open-source Schwab client references) before changing anything, then confirmed it empirically:
  field 8 was monotonically increasing across ticks (Total Volume, not the near-static Open
  Interest the old map claimed) and fields 16/17 fluctuated in the low hundreds (Bid/Ask Size, not
  Open Interest/Delta). **Fixed the root cause properly rather than just correcting numbers on both
  sides of the contract again**: `option-ticks` no longer sends Schwab's raw field-number object at
  all — the backend now normalizes every tick server-side into named fields (`{ symbol, bid, ask,
  last, bidSize, askSize, volume, openInterest, delta }`) via a new, unit-tested `mapOptionTick`
  helper, so there's no field-number table for the frontend to keep in sync with ever again. Partial
  "Change"-delivery semantics are preserved — a field is omitted (not defaulted to `0`) when Schwab
  didn't send it on that particular tick. **This is a breaking change to the `option-ticks` payload
  shape** — see the corrected contract in section 4. Deployed to preprod + prod.
  **Frontend action needed**: update `option-ticks` handling to read the new named fields instead of
  numeric keys; there is no backwards-compatible transition since the old shape was never actually
  usable.
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
