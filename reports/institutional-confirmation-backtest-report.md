# Institutional Confirmation Engine — Point-in-Time Backtest

Generated: 2026-09-06T15:14:20.478Z

## Direct answer

**No institutional filter earned promotion.** The existing Deep Leader Pullback remains the production candidate; Disclosure-covered baseline is only the strongest research comparator.

Reused 2026 diagnostic: 175 trades, 54.29% win rate, 0.314R expectancy and PF 1.778. It is not an untouched holdout because 2026 was already inspected in earlier system development. A robust 60%+ win rate was not established.

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
| 1 | Mutual-fund accumulation | 227 / 51.98% / 0.207R / 1.461 | 49 / 48.98% / 0.248R / 1.518 | No | No |
| 2 | Any MF+FPI accumulation | 251 / 50.6% / 0.158R / 1.332 | 49 / 48.98% / 0.248R / 1.518 | No | No |
| 3 | Locked baseline | 670 / 47.31% / 0.107R / 1.215 | 103 / 46.6% / 0.102R / 1.194 | Yes | No |
| 4 | Persistent institutional accumulation | 146 / 53.42% / 0.179R / 1.36 | 34 / 47.06% / 0.118R / 1.246 | No | No |
| 5 | Institutional score >=3 | 194 / 47.42% / 0.101R / 1.2 | 33 / 48.48% / 0.165R / 1.334 | No | No |
| 6 | Disclosure-covered baseline | 531 / 45.01% / 0.045R / 1.086 | 98 / 46.94% / 0.104R / 1.199 | Yes | No |
| 7 | MF+FPI accumulation >=0.25pp | 170 / 46.47% / 0.081R / 1.156 | 27 / 55.56% / 0.362R / 1.883 | No | No |
| 8 | Broad accumulation (MF and FPI) | 28 / 42.86% / 0.091R / 1.171 | 0 / 0% / 0R / - | No | No |
| 9 | Accumulation + net large-deal buying | 7 / 71.43% / -0.046R / 0.849 | 3 / 66.67% / 0.989R / 3.819 | No | No |
| 10 | FPI accumulation | 70 / 35.71% / -0.184R / 0.717 | 0 / 0% / 0R / - | No | No |

## Selected comparator

- Development: 531 / 45.01% / 0.045R / 1.086
- Validation: 98 / 46.94% / 0.104R / 1.199
- Reused 2026: 175 / 54.29% / 0.314R / 1.778
- Reused-2026 95% Wilson lower win-rate bound: 46.89%
- Disclosure coverage: 1237/1481 signals (83.52%)
- Optional bulk/block archive gaps: none

## Decision rule

An upgrade required adequate samples, positive expectancy and PF >=1.10 in both pre-2026 splits, at least 60% win rate in both, and no deterioration versus the locked baseline's worst-split expectancy. Missing institutional disclosure was never interpreted as buying or selling. Historical results are research evidence, not a promise of permanent profit.
