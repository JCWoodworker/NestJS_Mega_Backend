# Schwab Bot — Decision Audit, Explain & Suggested Settings

**Nest handoff for the React desk** (2026-09-04). Paste-ready.  
Companion index: [`schwab-frontend-notes.md`](./schwab-frontend-notes.md) §14.

---

## Why SCANNING can mean “doing nothing useful”

The bot evaluates entry **once per closed 1-minute SPY equity candle** (not the 7s heartbeat).  
`phase: SCANNING` only means: armed, in window, no open position, not in cooldown.

Until this ship, almost every “no trade” path was **silent** — so the activity feed only showed `PHASE` flips (e.g. `STOPPED → SCANNING`) even when Nest was evaluating every minute.

**Typical live story on a small account with both strategies + CONFIRMING:**  
strategies never agree → no `SIGNAL` → no trade. That is now visible as `NO_SIGNAL` rows.

---

## New / expanded APIs

### `GET /api/v1/subapps/schwab/bot/events?limit=&afterId=`

Unchanged path. Now:

- Default / max `limit` up to **1000** (was 500).
- Rows may include optional `payload` (JSON).
- Retention: **30 days** by timestamp (not a 500-row ring).
- Still newest-first; socket `bot-event` still fires on each new row.

### `GET /api/v1/subapps/schwab/bot/explain`

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

### `GET /api/v1/subapps/schwab/bot/settings/suggested`

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

### New (decision + operator audit)

| Type | Meaning | Typical `reason` / `payload` |
|------|---------|------------------------------|
| `GATE_SKIP` | Pre-signal gate blocked eval | `NOT_ARMED`, `OUTSIDE_WINDOW`, `COOLDOWN`, `MIN_EQUITY`, `STALE_QUOTE`, `INSUFFICIENT_CANDLES`, `ALREADY_IN_POSITION` |
| `NO_SIGNAL` | Strategies ran; CONFIRMING did not fire | `CONFIRMING_NO_AGREEMENT`; `payload.results`, `vwap`, `atr`, `orb`, `chartTime` |
| `OPERATOR_SETTINGS` | `PUT /bot/settings` | `payload: { before, after, patch }` |
| `OPERATOR_MODE` | `POST /bot/mode` | `from → to` |
| `OPERATOR_LANE` | `POST /bot/lane` | `from → to` |
| `OPERATOR_LIVE` | live enable/disable | `LIVE_ARMED` / `LIVE_DISARMED` |
| `ERROR` | Eval threw | message in `reason` |

**Wire shape** (socket + REST):

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
  payload?: Record<string, unknown>;  // NEW — optional
}
```

`GATE_SKIP` / `NO_SIGNAL` are **deduped** per `(type, reason, chartTime)` (~1 per SPY bar) so option-chart traffic does not double-write.

---

## Decision cadence

| Loop | Cadence | Writes audit? |
|------|---------|---------------|
| Entry eval | Each SPY 1m `chart-candle` (EQUITY only) | `GATE_SKIP` / `NO_SIGNAL` / `SIGNAL` → … |
| Soft stop / target | Each `underlying-price` tick | Exit events when triggered |
| Heartbeat | ~7s | Balances, loss/profit gates, recon, phase emit — not entry eval |

---

## Frontend recommendations

1. **Status strip:** poll or socket-drive `GET /bot/explain` (or derive from `bot-event` stream) and show `summary`.
2. **Activity feed:** filter chips for Decision (`NO_SIGNAL`, `GATE_SKIP`) vs Trades vs Operator.
3. **Settings panel:** “Suggested for $X (MICRO)” card from `/settings/suggested`; **Apply** → `PUT` with `patch`; show `rationale` + `warnings`.
4. **Help copy:** “SCANNING” ≠ “about to trade” — idle confirmation needs `NO_SIGNAL` / explain.
5. **Chat agent (deferred):** ground answers on `/explain` + `/events` + `/settings/suggested` — do not invent reasons Nest never logged.

---

## Auth / rate limit

Same JWT + 120/min throttle as other `/bot/*` routes.

---

## Acceptance checklist

- [ ] Armed SCANNING session produces `NO_SIGNAL` (or `GATE_SKIP`) within ~1–2 minutes of a SPY bar close
- [ ] `PUT /bot/settings` creates `OPERATOR_SETTINGS` with before/after
- [ ] Mode / lane / live arm create `OPERATOR_*` events
- [ ] `GET /bot/explain` summary mentions CONFIRMING / gate reason when idle
- [ ] `GET /bot/settings/suggested` for ~$110 → `MICRO`, single strategy, `riskPct` &lt; 100
- [ ] Apply suggested via PUT succeeds; settings match `suggested`
