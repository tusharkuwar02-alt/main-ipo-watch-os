# Institutional Confirmation Engine — Point-in-Time Backtest

Generated: 2026-09-07T04:19:43.432Z

## Direct answer

**No institutional filter earned promotion.** The existing Deep Leader Pullback remains the production candidate; Institutional score >=3 is only the strongest research comparator.

Reused 2026 diagnostic: 119 trades, 49.58% win rate, 0.127R expectancy and PF 1.272. It is not an untouched holdout because 2026 was already inspected in earlier system development. A robust 60%+ win rate was not established.

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
| 1 | Mutual-fund accumulation | 277 / 51.99% / 0.204R / 1.453 | 49 / 48.98% / 0.248R / 1.518 | No | No |
| 2 | Institutional score >=3 | 458 / 50.22% / 0.167R / 1.363 | 65 / 49.23% / 0.179R / 1.378 | Yes | No |
| 3 | MF+FPI accumulation >=0.25pp | 400 / 48.75% / 0.132R / 1.276 | 57 / 50.88% / 0.181R / 1.403 | Yes | No |
| 4 | Any MF+FPI accumulation | 417 / 48.44% / 0.126R / 1.26 | 57 / 50.88% / 0.181R / 1.403 | Yes | No |
| 5 | Locked baseline | 670 / 47.31% / 0.107R / 1.215 | 103 / 46.6% / 0.102R / 1.194 | Yes | No |
| 6 | Disclosure-covered baseline | 614 / 47.23% / 0.098R / 1.196 | 98 / 46.94% / 0.104R / 1.199 | Yes | No |
| 7 | Broad accumulation (MF and FPI) | 189 / 48.68% / 0.136R / 1.273 | 29 / 55.17% / 0.345R / 1.781 | No | No |
| 8 | FPI accumulation | 411 / 46.72% / 0.095R / 1.191 | 56 / 53.57% / 0.227R / 1.491 | Yes | No |
| 9 | Persistent institutional accumulation | 262 / 52.29% / 0.198R / 1.419 | 34 / 47.06% / 0.052R / 1.111 | No | No |
| 10 | Accumulation + net large-deal buying | 11 / 36.36% / -0.51R / 0.238 | 2 / 50% / 0.685R / 2.302 | No | No |

## Selected comparator

- Development: 458 / 50.22% / 0.167R / 1.363
- Validation: 65 / 49.23% / 0.179R / 1.378
- Reused 2026: 119 / 49.58% / 0.127R / 1.272
- Reused-2026 95% Wilson lower win-rate bound: 40.75%
- Disclosure coverage: 1386/1481 signals (93.59%)
- Optional bulk/block archive gaps: none

## Decision rule

An upgrade required adequate samples, positive expectancy and PF >=1.10 in both pre-2026 splits, at least 60% win rate in both, and no deterioration versus the locked baseline's worst-split expectancy. Missing institutional disclosure was never interpreted as buying or selling. Historical results are research evidence, not a promise of permanent profit.
