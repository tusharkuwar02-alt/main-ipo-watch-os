# Institutional Confirmation Engine — Point-in-Time Backtest

Generated: 2026-09-06T19:16:43.394Z

## Direct answer

**No institutional filter earned promotion.** The existing Deep Leader Pullback remains the production candidate; Institutional score >=3 is only the strongest research comparator.

Reused 2026 diagnostic: 22 trades, 63.64% win rate, 0.394R expectancy and PF 2.143. It is not an untouched holdout because 2026 was already inspected in earlier system development. A robust 60%+ win rate was not established.

## Fixed trading rules

- Existing Deep Leader Pullback entry only; no new chart setup
- 50% exit at 2R, remaining 50% at 3R, breakeven stop after T1
- Maximum 10 sessions, next-session execution, 0.30% friction, conservative stop-first same-bar handling
- Development 2022-2024; validation 2025; 2026 reused diagnostic only

## Institutional evidence tested

Quarterly mutual-fund and FPI percentages came from NSE shareholding XBRL filings. A filing became usable only on the calendar day after its NSE broadcast, so quarter-end data could not leak into an earlier signal. Bulk/block-deal buys and sells were netted by client before aggregation; deals on the signal date were excluded. Market-wide FII/DII flow was deliberately excluded because it is not stock-level and can be distorted by hedging.

## Pre-2026 comparison

| Rank | Variant | Development trades / WR / Exp / PF | Validation trades / WR / Exp / PF | Sample OK | 60% gate |
|---:|---|---:|---:|---:|---:|
| 1 | Mutual-fund accumulation | 254 / 53.15% / 0.242R / 1.556 | 49 / 48.98% / 0.248R / 1.518 | No | No |
| 2 | Institutional score >=3 | 387 / 49.35% / 0.16R / 1.34 | 60 / 50% / 0.175R / 1.362 | Yes | No |
| 3 | Broad accumulation (MF and FPI) | 166 / 49.4% / 0.178R / 1.366 | 29 / 55.17% / 0.345R / 1.781 | No | No |
| 4 | Any MF+FPI accumulation | 398 / 48.24% / 0.123R / 1.254 | 57 / 50.88% / 0.181R / 1.403 | Yes | No |
| 5 | Locked baseline | 670 / 47.31% / 0.107R / 1.215 | 103 / 46.6% / 0.102R / 1.194 | Yes | No |
| 6 | MF+FPI accumulation >=0.25pp | 313 / 47.28% / 0.118R / 1.24 | 45 / 53.33% / 0.19R / 1.424 | No | No |
| 7 | Disclosure-covered baseline | 606 / 46.7% / 0.084R / 1.167 | 98 / 46.94% / 0.104R / 1.199 | Yes | No |
| 8 | FPI accumulation | 397 / 45.84% / 0.081R / 1.161 | 56 / 53.57% / 0.227R / 1.491 | Yes | No |
| 9 | Persistent institutional accumulation | 245 / 51.02% / 0.169R / 1.35 | 34 / 47.06% / 0.052R / 1.111 | No | No |
| 10 | Accumulation + net large-deal buying | 11 / 36.36% / -0.51R / 0.238 | 2 / 50% / 0.685R / 2.302 | No | No |

## Selected comparator

- Development: 387 / 49.35% / 0.16R / 1.34
- Validation: 60 / 50% / 0.175R / 1.362
- Reused 2026: 22 / 63.64% / 0.394R / 2.143
- Reused-2026 95% Wilson lower win-rate bound: 42.95%
- Disclosure coverage: 1375/1481 signals (92.84%)
- Optional bulk/block archive gaps: none

## Decision rule

An upgrade required adequate samples, positive expectancy and PF >=1.10 in both pre-2026 splits, at least 60% win rate in both, and no deterioration versus the locked baseline's worst-split expectancy. Missing institutional disclosure was never interpreted as buying or selling. Historical results are research evidence, not a promise of permanent profit.
