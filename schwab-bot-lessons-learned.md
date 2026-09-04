# Schwab Bot — Lessons Learned

Living post-mortem / context for the Nest bot + React desk.  
Append new entries at the top. Pair with [`schwab-bot-audit-and-suggested-settings.md`](./schwab-bot-audit-and-suggested-settings.md) for wire contracts.

---

## 2026-09-04 — First live fill: SPY 0DTE 770C, ~$17–21 loss (manual close)

### What happened (from `bot_events`, America/New_York)

| Time (ET) | Event | Detail |
|-----------|--------|--------|
| 13:23:03 | `SIGNAL` | `CONFIRMING VWAP_PULLBACK → CALL` (only VWAP enabled) |
| 13:23:03 | `ENTRY_SUBMIT` | `SPY 260904C00770000` ×1 |
| 13:23:06 | `ENTRY_FILL` | **BUY @ $0.73**, SPY **770.23** |
| 13:23–13:30 | `GATE_SKIP` | `ALREADY_IN_POSITION` (no soft exit) |
| 13:30:16 | `EXIT_*` / `LOCKOUT` | **`RECON_MISMATCH`** — operator flattened manually; bot then halted |
| 13:30:18 | `FLAT_KILL` / `MANUAL` | Kill + mode off |

Exit fill recorded: **SELL @ $0.52**, SPY **769.85**.  
Premium move: \(0.73 − 0.52\) × 100 ≈ **−$21** (user ~$17 after fees / memory).  
Underlying move over the hold: **−$0.38** on SPY.

Settings around the trade: single strategy `VWAP_PULLBACK`, CALL-only, `minPremium` 0.40, `riskPct` briefly 35 then back to **100**, `maxLossUsd` 50 (day halt — not a per-trade option stop).

### Why the bot did not cut the loss

Soft stop / target were **hardcoded on SPY spot** (`spot ± 2` / `+ 3`), not option mark. SPY never hit ~768.23 while the 0DTE call bled ~29%. ATR was ~0.15 — a $2 SPY stop was ~14× ATR.

### Why exit reason is `RECON_MISMATCH` (not soft stop)

Manual flatten outside the bot left Schwab flat while Nest still had `openPosition`. Heartbeat recon → `LOCKOUT: RECON_MISMATCH`.

### Fix shipped (same day)

Premium + ATR soft exits in Nest:

- At fill: store `stopPremium` / `targetPremium` / ATR-scaled `stopUnderlying` / `targetUnderlying` on `openPosition` (+ `ENTRY_FILL.payload`).
- While in position: throttle option **bid** quotes (≥3s); exit reasons `PREMIUM_STOP` | `PREMIUM_TARGET` | `UNDERLYING_STOP` | `UNDERLYING_TARGET`.
- Settings defaults: `usePremiumStop` true, `premiumStopPct` **25** (MICRO suggested **20**), `usePremiumTarget` true, `premiumTargetPct` **40** (MICRO **35**), `stopAtrMult` 1.5, `targetAtrMult` 2.5.

**Would have done on this trade:** entry 0.73 → 25% stop at ~**0.55**; bid 0.52 → automatic `PREMIUM_STOP` instead of waiting for SPY −2.

### Remaining follow-ups

1. Prefer MICRO suggested settings before live (`GET /bot/settings/suggested`).
2. Optional: treat operator flatten as clean `OPERATOR_FLAT` instead of `RECON_MISMATCH` lockout.

---

## Template for next entries

```markdown
## YYYY-MM-DD — short title

### What happened
### Why the bot did what it did
### Outcome ($)
### Lessons
### Follow-ups
```
