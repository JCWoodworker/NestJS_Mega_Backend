# Research brief

The Saturday search reads this before it picks. A line here is a hypothesis. It becomes a setting only after it beats the current book on sessions it was not fit to.

The book is a long single-leg SPXW premium buyer. That is the side of 0DTE the public record says loses after the spread.

- Retail 0DTE losses after daily expirations are about $350k a day in the Gayda, de Jong, and Goyal sample (Feb 2021–Sep 2023). About 60% is transaction cost. The losses sit in single-leg trades that pay premium up front. Multi-leg trades that sell volatility are the other side.
- The same-day variance premium in SPXW is small, and the payoffs are tail-heavy and unstable across regimes (Vilkov, Neuhierl, and Xiao, through Jan 2026). A call of direction holds up better than a forecast of how far the move goes.
- An SPX 0DTE Donchian rider with a prior-day VIX filter looked strong on 2023–2026 and failed a 19-year out-of-sample test. The in-sample winner sat near the 67th percentile on the long sample (Wang, 2026). A published Sharpe ratio, including one that jumps after dropping a weekday, is that same trap.
- Intraday opening-range and VWAP edges on the index are small and disappear once realistic costs are charged.

Do not paste a published parameter. Do not add a weekday filter, a VIX cutoff, a spread, an overnight hold, or a weekly because a paper liked it. One new idea in a week, and only after the search of the knobs we already have.

The ideas worth measuring on this tape, in order:

1. Trade less of the rules that are red. Run each current rule alone. Drop a rule only after it is red on the search window for two Saturdays and the book without it still wins the replay.
2. Skip the quietest sessions, ranked by the first hour's high minus low. The cutoff is learned on the fit sessions and checked on the two held-out sessions.
3. Stop new entries at 11:00, 12:00, or 13:00 and compare with the current window.

Fees stay in the score. A candidate that wins by trading many more contracts still has to finish at least as many green days.
