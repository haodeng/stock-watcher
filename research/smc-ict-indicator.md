# SMC / ICT and a chart indicator

*Research date: 2026-09-22. This is product research, not investment advice or evidence of an edge.*

## What the terms mean

**ICT** (“Inner Circle Trader”) is Michael J. Huddleston's trading-education framework. Its official site presents the framework as *Smart Money Concepts* (SMC), and groups market structure, liquidity, fair-value gaps, order blocks, and time/session ideas under that name. The terminology is creator-led, not an industry standard or a formal market-data specification. [ICT official home](https://www.theinnercircletrader.com/), [official 2022 mentorship episode using “my SMT concept”](https://www.youtube.com/watch?v=QkokVv0owSE).

**SMC** is the umbrella vocabulary. It commonly interprets price structure and areas such as prior equal highs/lows or three-candle gaps as institutional liquidity or order-flow activity. That interpretation is a trading thesis, not something that OHLCV data can prove.

**SMT divergence** (“Smart Money Technique”) is the most suitable part for a visual indicator because it compares two instruments. A practical interpretation is: on the same timeframe, two normally correlated instruments cease confirming one another's swing extreme.

- Bearish candidate: instrument A makes a new swing high; instrument B does not make a comparable new swing high.
- Bullish candidate: instrument A makes a new swing low; instrument B does not make a comparable new swing low.

The creator's material confirms that SMT is an ICT concept, but I found no first-party, textual rulebook that fixes its pivot, comparison-window, pairing, or entry rules. The concrete definition above is therefore drawn from a commercial secondary explainer and must be treated as an implementation choice, not canonical ICT. That explainer also describes SMT as contextual confirmation rather than a standalone trade signal. [Secondary SMT definition and examples](https://innercircletrader.net/tutorials/ict-smt-divergence-smart-money-technique/).

## Can it be programmed from this app's data?

Yes, **as an explicit heuristic**, not as a detector of “smart money.” The app already has timestamped OHLCV bars and displays a single instrument. Swing highs/lows, gap-like patterns, candle body/wicks, volume comparisons, and their chart markers are deterministic functions of that data.

SMT specifically also needs a **second, aligned price series**. The current bars endpoint returns one stock at a time, so an SMT implementation would need to load a user-selected peer or benchmark and align shared trading dates. A broad Danish index is often a poor default pair for an individual stock; sector peers or closely related instruments are more defensible only after checking their relationship.

### Minimum reproducible SMT rule

Use daily bars first (not the app's 1-hour/4-hour history):

1. Require a named pair A/B and at least 60 overlapping sessions.
2. Calculate rolling close-to-close correlation; suppress the overlay unless it is above a documented threshold (for example, 0.70). Correlation is a screening condition, **not** proof of cointegration or predictability.
3. Define a confirmed pivot using a fixed window, e.g. a high (low) exceeding the three bars on each side. Confirmation arrives three bars late; never label the unconfirmed current bar as a completed swing.
4. For each new A pivot, compare B's corresponding pivot/range against its prior B pivot. If A breaks its prior high while B does not, mark a bearish relative-high divergence; inverse for a bullish relative-low divergence.
5. Draw a small red downward marker above the A candle or green upward marker below it. A tooltip should disclose the pair, both pivot dates/prices, lookback, and correlation. Label it **“relative-high/low divergence”** rather than implying a proven institutional transaction.

This produces a useful, explainable visual screen. It will necessarily differ from discretionary ICT annotations because pivot selection, “correlated” pairing, and timing are not standardized.

## Worth building?

For this personal Denmark-stock watchlist, the small, honest version is viable: a per-stock optional peer selector and the confirmed divergence markers above. It should be a research overlay, off by default, with no automatic alert or trade recommendation.

An even smaller first visual is a **single-series liquidity-sweep marker**: flag a confirmed bar that trades beyond a prior confirmed swing high/low and closes back inside it. That needs no second symbol, but it is *not SMT*; it is merely an objectively specified price-action pattern.

Avoid trying to automate the full SMC/ICT vocabulary in one pass. “Order block,” “liquidity pool,” bias, and intended institutional motive contain discretionary context. Technical-chart pattern research explicitly identifies subjectivity as a core obstacle and shows why any rules must be fixed before evaluating them. [Lo, Mamaysky & Wang, *Foundations of Technical Analysis* (NBER working paper 7613)](https://www.nber.org/papers/w7613).

## Evidence and limits

- I found no peer-reviewed test establishing that ICT/SMT itself predicts returns or identifies institutional activity.
- Pair-trading research is related but is not validation of SMT: it tested pre-defined, normalized-price pair selection and mean-reversion rules in historical US equities, not candle-pivot divergence. [Gatev, Goetzmann & Rouwenhorst, *Pairs Trading*](https://www.nber.org/papers/w7032).
- More broadly, historical technical-analysis results are method-, market-, period-, and cost-dependent. They cannot validate a new, visually selected implementation without an out-of-sample test including fees and delisted securities. The proposed overlay should therefore support journaling/backtesting, not make predictive claims.

## Recommended scope

Implement only the confirmed daily **relative divergence** overlay first: fixed 3-bar pivots, user-selected peer, 60-day correlation gate, and markers/tooltips. Save its parameters with the pair if it proves useful. Add a backtest only after enough data and an exact entry/exit rule exist; otherwise it would manufacture false precision.
