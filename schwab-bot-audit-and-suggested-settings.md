# Schwab Bot — Decision Audit, Explain & Suggested Settings

**Nest handoff for the React desk** (updated 2026-09-04). Paste-ready.  
Companion index: [`schwab-frontend-notes.md`](./schwab-frontend-notes.md) §14.

**Shipped:** preprod **v423** / prod **v263** (`74fe780`) — decision audit + explain + suggested settings + **log browser**.

**Breaking change:** `GET /bot/events` now returns a **pagination envelope** (`{ items, … }`), not a bare array. Update any client that assumed `BotEvent[]`.

---

## Why SCANNING can mean “doing nothing useful”

The bot evaluates entry **once per closed 1-minute SPY equity candle** (not the 7s heartbeat).  
`phase: SCANNING` only means: armed, in window, no open position, not in cooldown.

Until this ship, almost every “no trade” path was **silent** — so the activity feed only showed `PHASE` flips (e.g. `STOPPED → SCANNING`) even when Nest was evaluating every minute.

**Typical live story on a small account with both strategies + CONFIRMING:**  
strategies never agree → no `SIGNAL` → no trade. That is now visible as `NO_SIGNAL` rows.

---

## Log browser — `GET /api/v1/subapps/schwab/bot/events`

Auth: same JWT as other `/bot/*`. Rate limit: 120/min.

Retention: **30 days** (rows older than that are deleted). Plan UI date pickers within that window.

### Response envelope

```ts
{
  items: BotEvent[];       // newest-first
  limit: number;           // echoed (1–1000, default 100)
  nextBeforeId: number | null;  // oldest id in this page → pass as beforeId for older page
  nextAfterId: number | null;   // newest id in this page → pass as afterId for newer catch-up
  hasMoreOlder: boolean;
  hasMoreNewer: boolean;
}
```

### Query params

| Param | Type | Purpose |
|-------|------|---------|
| `limit` | int 1–1000 | Page size (default 100) |
| `beforeId` | int | **Scroll older:** only `id < beforeId` (use `nextBeforeId` from prior page) |
| `afterId` | int | **Catch-up newer:** only `id > afterId` (socket miss / resume) |
| `type` | repeatable enum | Filter types: `?type=NO_SIGNAL&type=GATE_SKIP` |
| `lane` | `BOT_PAPER` \| `BOT_LIVE` | Lane filter |
| `reason` | string | Exact reason match (e.g. `COOLDOWN`, `CONFIRMING_NO_AGREEMENT`) |
| `q` | string ≤128 | Case-insensitive search in `reason`, `symbol`, `orderId`, and JSON `payload` text |
| `from` | epoch ms | Inclusive lower bound on `at` (**date picker from**) |
| `to` | epoch ms | Inclusive upper bound on `at` (**date picker to**) |

### Pagination UX (recommended)

1. Initial load: `GET /bot/events?limit=50` (optional `from`/`to` / filters).
2. Infinite scroll older: `GET /bot/events?limit=50&beforeId={nextBeforeId}&…same filters`.
3. Live catch-up while viewing: socket `bot-event` **or** poll `?afterId={nextAfterId}`.
4. Date picker: convert local day bounds → UTC epoch ms → `from` / `to` (clamp to last 30 days).
5. Filter chips: map to `type=` repeats (Decision / Trades / Operator — see groupings below).

### Example URLs

```
# Last 50 of everything
GET /bot/events?limit=50

# Decision-only for today (example epochs)
GET /bot/events?limit=50&type=NO_SIGNAL&type=GATE_SKIP&from=1788532800000&to=1788619199999

# Older page after user scrolled
GET /bot/events?limit=50&beforeId=1200&type=OPERATOR_SETTINGS

# Search settings diffs / symbols
GET /bot/events?q=riskPct&limit=50

# Paper lane only
GET /bot/events?lane=BOT_PAPER&limit=100
```

### Filter chip → `type` groupings (UI suggestion)

| Chip | `type` values |
|------|----------------|
| Decisions | `NO_SIGNAL`, `GATE_SKIP`, `SIGNAL`, `SKIP`, `ERROR` |
| Trades | `ENTRY_SUBMIT`, `ENTRY_FILL`, `EXIT_SUBMIT`, `EXIT_FILL` |
| Operator | `OPERATOR_SETTINGS`, `OPERATOR_MODE`, `OPERATOR_LANE`, `OPERATOR_LIVE`, `FLAT_KILL`, `UNLOCK`, `LOCKOUT` |
| Phase | `PHASE` |

### Real-time

Socket `/options` event `bot-event` — same `BotEvent` shape as `items[]` (includes optional `payload`). Use for live tail; use REST for history / filters / date range.

---

## `GET /api/v1/subapps/schwab/bot/explain`

No LLM. One-glance summary for the status strip / help panel.

```ts
{
  phase: BotPhase;
  summary: string;              // human one-liner
  status: BotStatus;
  settings: BotSettings;
  lastDecision: BotEvent | null;
  recentDecisions: BotEvent[];  // NO_SIGNAL / GATE_SKIP / SIGNAL / SKIP / ERROR
  suggestedTier: 'MICRO' | 'SMALL' | 'STANDARD' | 'COMFORTABLE';
  suggestedHint: string | null; // when current settings diverge from suggested
}
```

**UI:** show `summary` under the status strip. Link to suggested settings when `suggestedHint` is set.

---

## `GET /api/v1/subapps/schwab/bot/settings/suggested`

Account-size-aware recommendations from **current** `BotStatus.equity` (paper or live lane equity).

```ts
{
  equity: number;
  tier: 'MICRO' | 'SMALL' | 'STANDARD' | 'COMFORTABLE';
  suggested: BotSettings;           // full recommended view
  patch: Partial<BotSettings>;      // only keys that differ — ready for PUT
  rationale: string[];
  warnings: string[];               // fee / MICRO warnings
}
```

**Apply:** `PUT /bot/settings` with `patch` (or whole `suggested`). Nest does **not** auto-apply.  
Applying logs `OPERATOR_SETTINGS` like any other settings change.

| Tier | Equity | Intent |
|------|--------|--------|
| MICRO | &lt; $500 | Single strategy (`VWAP_PULLBACK`), riskPct ~35, cooler cooldown, fee warnings |
| SMALL | $500–$2k | Dual strategies OK, riskPct ~20 |
| STANDARD | $2k–$5k | Higher minPremium (~$1+), riskPct ~12 |
| COMFORTABLE | ≥ $5k | Closer to original §14b defaults |

Respects `canBuyPuts` — never suggests PUT in `directionsEnabled` when capability is false.

---

## `BotEvent` types (full set)

### Existing (live watch / fills)

| Type | Meaning |
|------|---------|
| `SIGNAL` | CONFIRMING strategies agreed |
| `SKIP` | Post-signal reject (`DIRECTION_DISABLED`, `SKIP_BUDGET`, `NO_CONTRACT_MATCH`, …) |
| `ENTRY_SUBMIT` / `ENTRY_FILL` | Entry path |
| `EXIT_SUBMIT` / `EXIT_FILL` | Exit path |
| `FLAT_KILL` | Kill switch |
| `LOCKOUT` | Auto halt (max loss, EOD, socket loss, …) |
| `UNLOCK` | Day rollover or `OPERATOR_UNLOCK` |
| `PHASE` | Phase machine transition |

### Decision + operator audit

| Type | Meaning | Typical `reason` / `payload` |
|------|---------|------------------------------|
| `GATE_SKIP` | Pre-signal gate blocked eval | `NOT_ARMED`, `OUTSIDE_WINDOW`, `COOLDOWN`, `MIN_EQUITY`, `STALE_QUOTE`, `INSUFFICIENT_CANDLES`, `ALREADY_IN_POSITION` |
| `NO_SIGNAL` | Strategies ran; CONFIRMING did not fire | `CONFIRMING_NO_AGREEMENT`; `payload.results`, `vwap`, `atr`, `orb`, `chartTime` |
| `OPERATOR_SETTINGS` | `PUT /bot/settings` | `payload: { before, after, patch }` |
| `OPERATOR_MODE` | `POST /bot/mode` | `from → to` |
| `OPERATOR_LANE` | `POST /bot/lane` | `from → to` |
| `OPERATOR_LIVE` | live enable/disable | `LIVE_ARMED` / `LIVE_DISARMED` |
| `ERROR` | Eval threw | message in `reason` |

**Wire shape** (socket + REST `items[]`):

```ts
interface BotEvent {
  id: string;
  at: number;                 // epoch ms
  lane: string | null;
  type: string;
  direction?: string;
  side?: string;
  symbol?: string;
  quantity?: number;
  fillPrice?: number;
  underlyingPrice?: number;
  strategies?: string[];
  reason?: string;
  orderId?: string;
  payload?: Record<string, unknown>;  // optional — diffs, indicator snapshots
}
```

`GATE_SKIP` / `NO_SIGNAL` are **deduped** per `(type, reason, chartTime)` (~1 per SPY bar).

---

## Decision cadence

| Loop | Cadence | Writes audit? |
|------|---------|---------------|
| Entry eval | Each SPY 1m `chart-candle` (EQUITY only) | `GATE_SKIP` / `NO_SIGNAL` / `SIGNAL` → … |
| Soft stop / target | Each `underlying-price` tick | Exit events when triggered |
| Heartbeat | ~7s | Balances, loss/profit gates, recon, phase emit — not entry eval |

---

## Other bot routes (unchanged contract, still relevant)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/bot/status` | Includes `phase`, `recentEvents` (last 20, still a bare array) |
| PUT | `/bot/settings` | Accepts `directionsEnabled`, `canBuyCalls`/`canBuyPuts`, `profitTarget*` aliases |
| POST | `/bot/mode`, `/bot/lane`, `/bot/kill`, `/bot/unlock`, `/bot/live/enable`, `/bot/live/disable` | Operator actions → audit events |

---

## Frontend build checklist

1. **Status strip:** `GET /bot/explain` → show `summary`; link when `suggestedHint` set.
2. **Log page / sidebar:** envelope-aware `GET /bot/events` with filters, date range (`from`/`to`), `beforeId` infinite scroll, `q` search box.
3. **Live tail:** socket `bot-event` prepend (respect active filters client-side or refetch).
4. **Settings:** “Suggested for $X (MICRO)” from `/settings/suggested` → Apply via `PUT` with `patch`.
5. **Help:** SCANNING ≠ about to trade — point at `NO_SIGNAL` / explain.
6. **Chat (deferred):** ground on `/explain` + `/events` + `/settings/suggested`.

---

## Acceptance checklist

- [ ] Armed SCANNING produces `NO_SIGNAL` or `GATE_SKIP` within ~1–2 minutes of a SPY bar close
- [ ] `GET /bot/events` returns `{ items, nextBeforeId, hasMoreOlder, … }` (not a bare array)
- [ ] `?type=NO_SIGNAL&type=GATE_SKIP` filters; `?from=&to=` date range; `?q=` search; `?beforeId=` older page
- [ ] `PUT /bot/settings` creates `OPERATOR_SETTINGS` with before/after
- [ ] Mode / lane / live arm create `OPERATOR_*` events
- [ ] `GET /bot/explain` summary mentions CONFIRMING / gate reason when idle
- [ ] `GET /bot/settings/suggested` for ~$110 → `MICRO`, single strategy, `riskPct` &lt; 100
- [ ] Apply suggested via PUT succeeds; settings match `suggested`
