# Smart Money Footprint OS — Final Conditional T2 Runner Backtest

Generated: 2026-09-06T09:14:04.161Z

## Direct answer

The pre-holdout selection chose **100% at T1**. No conditional runner passed the strict improvement gate, so the 100% T1 baseline remained selected. Its untouched 2026 result was **55.75% win rate**, **0.175R expectancy**, **1.147 payoff ratio**, and **1.446 profit factor** over 113 trades.

## Rules and controls

- Frozen entry: SMA21 pullback + 1.5ATR stop; 10D return ≥8%; Breakout Triggered only; RS20 ≥10%
- T1 1.5R, T2 2R, maximum five sessions, 0.30% friction
- Conditional runners used 20% or 25% size
- Eligibility used only signal-time bullish regime or breadth; confirmation used T1-day close and volume known at that close
- Runner confirmation required close ≥T1 and close-location ≥0.65, optionally volume ≥1.2× prior 20-session average
- Selection: 2022-2024 development and 2025 validation; 2026 opened only for the frozen winner
- Improvement gate: payoff higher in both samples, at least 97% expectancy retained, and validation win rate no more than two points below baseline

## Rankings

| Rank | Rule | Development WR / Exp / Payoff | Validation WR / Exp / Payoff | Qualified |
|---:|---|---:|---:|---:|
| 1 | 100% at T1 | 59.34% / 0.348R / 1.411 | 57.61% / 0.314R / 1.406 | No |
| 2 | 80% T1 / 20% conditional T2; bullish signal regime; strong T1 close and volume ≥1.2×; BE stop | 59.34% / 0.343R / 1.399 | 57.61% / 0.309R / 1.394 | No |
| 3 | 80% T1 / 20% conditional T2; bullish signal regime; strong T1 close and volume ≥1.2×; 1ATR stop | 59.34% / 0.343R / 1.4 | 57.61% / 0.309R / 1.394 | No |
| 4 | 80% T1 / 20% conditional T2; bullish signal regime; T1 close ≥T1 and CLV ≥0.65; 1ATR stop | 59.34% / 0.342R / 1.399 | 57.61% / 0.309R / 1.394 | No |
| 5 | 80% T1 / 20% conditional T2; bullish signal regime; T1 close ≥T1 and CLV ≥0.65; BE stop | 59.34% / 0.342R / 1.398 | 57.61% / 0.309R / 1.394 | No |
| 6 | 80% T1 / 20% conditional T2; signal breadth ≥55%; strong T1 close and volume ≥1.2×; 1ATR stop | 59.34% / 0.342R / 1.397 | 57.61% / 0.319R / 1.415 | No |
| 7 | 80% T1 / 20% conditional T2; signal breadth ≥55%; T1 close ≥T1 and CLV ≥0.65; BE stop | 59.34% / 0.341R / 1.396 | 57.61% / 0.32R / 1.417 | No |
| 8 | 80% T1 / 20% conditional T2; signal breadth ≥55%; T1 close ≥T1 and CLV ≥0.65; 1ATR stop | 59.34% / 0.341R / 1.396 | 57.61% / 0.32R / 1.417 | No |
| 9 | 80% T1 / 20% conditional T2; signal breadth ≥55%; strong T1 close and volume ≥1.2×; BE stop | 59.34% / 0.341R / 1.396 | 57.61% / 0.319R / 1.415 | No |
| 10 | 75% T1 / 25% conditional T2; bullish signal regime; T1 close ≥T1 and CLV ≥0.65; 1ATR stop | 59.34% / 0.341R / 1.396 | 57.61% / 0.307R / 1.391 | No |
| 11 | 75% T1 / 25% conditional T2; bullish signal regime; strong T1 close and volume ≥1.2×; BE stop | 59.34% / 0.341R / 1.396 | 57.61% / 0.307R / 1.391 | No |
| 12 | 75% T1 / 25% conditional T2; bullish signal regime; strong T1 close and volume ≥1.2×; 1ATR stop | 59.34% / 0.342R / 1.397 | 57.61% / 0.307R / 1.391 | No |

## Untouched holdout for selected rule

| Trades | Win rate | T1 hit | T2 hit | Runner eligible | Runner held | Expectancy | PF | Payoff |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 113 | 55.75% | 31.86% | 0% | 0% | 0% | 0.175R | 1.446 | 1.147 |

## Decision

Use the conditional runner only if it passed the predefined gate and stayed positive on holdout. Otherwise retain 100% exit at T1. The live OS/UI is unchanged by this research run.
