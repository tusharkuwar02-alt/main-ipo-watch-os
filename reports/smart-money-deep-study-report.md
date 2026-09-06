# Smart Money Footprint OS — Deep Entry, Stop and Target Study

Generated: 2026-09-06T09:14:04.161Z

## Direct answer

No candidate achieved a genuine ≥65% win rate with positive expectancy in development, validation, and untouched holdout data while keeping T1 at 1.5R.

The best candidate selected without looking at the 2026 holdout used **SMA21 pullback + 1.5ATR stop** with: 10D return ≥8%, Breakout Triggered only, RS20 ≥10%. Its 2026 holdout result was **55.75% win rate**, **0.192R expectancy**, and **1.489 profit factor** over 113 trades. The 95% Wilson lower bound for its holdout win rate was 46.56%.

## Validation design

- Development: 2022–2024
- Validation used for model selection: 2025
- Untouched holdout: 2026
- Minimum 200 development and 60 validation trades
- 0.30% round-trip friction, next-session execution, stop-first same-bar rule
- T1 never reduced below 1.5R
- 1064 rule combinations survived minimum-sample checks

## Top candidates

| Rank | Entry + stop | Filters | Development trades / WR / Exp | Validation trades / WR / Exp | Holdout trades / WR / Exp |
|---:|---|---|---:|---:|---:|
| 1 | SMA21 pullback + 1.5ATR stop | 10D return ≥8%; Breakout Triggered only; RS20 ≥10% | 273 / 59.34% / 0.376R | 92 / 57.61% / 0.316R | 113 / 55.75% / 0.192R |
| 2 | SMA21 pullback + 1.5ATR stop | 10D return ≥8%; Accumulation ≥85; Distribution ≤25 | 225 / 60.44% / 0.353R | 84 / 58.33% / 0.195R | 79 / 49.37% / 0.076R |
| 3 | SMA21 pullback + 1.5ATR stop | 10D return ≥8%; Accumulation ≥85 | 228 / 60.53% / 0.352R | 84 / 58.33% / 0.195R | 80 / 50% / 0.082R |
| 4 | SMA21 pullback + 1.5ATR stop | 10D return ≥8%; Breakout Triggered only; Close location ≥0.75 | 270 / 60.74% / 0.375R | 95 / 54.74% / 0.229R | 98 / 62.24% / 0.372R |
| 5 | SMA21 pullback + 1.5ATR stop | 10D return ≥8%; High confidence; Distribution ≤25 | 289 / 57.79% / 0.33R | 65 / 56.92% / 0.18R | 91 / 49.45% / 0.02R |
| 6 | SMA21 pullback + 1.5ATR stop | Breakout Triggered only; RS20 ≥10%; Close location ≥0.75 | 204 / 60.78% / 0.35R | 100 / 54% / 0.233R | 105 / 65.71% / 0.143R |
| 7 | SMA21 pullback + 1.5ATR stop | 10D return ≥8%; High confidence | 313 / 57.83% / 0.343R | 68 / 55.88% / 0.19R | 95 / 49.47% / 0.044R |
| 8 | SMA21 pullback + 1.5ATR stop | 10D return ≥8%; RS20 ≥10% | 441 / 54.65% / 0.247R | 196 / 54.08% / 0.18R | 167 / 56.29% / 0.222R |
| 9 | SMA21 pullback + 1.5ATR stop | 10D return ≥8%; RS20 ≥10%; Distribution ≤25 | 297 / 53.2% / 0.268R | 143 / 52.45% / 0.155R | 125 / 56% / 0.182R |
| 10 | SMA21 pullback + 1.5ATR stop | 10D return ≥8%; Breakout Triggered only; Distribution ≤25; Close location ≥0.75 | 200 / 63% / 0.387R | 70 / 52.86% / 0.18R | 82 / 64.63% / 0.37R |

## T1 / T2 / T3 study for the selected setup

| Target | RR | Max sessions | Development hit rate | Validation hit rate | Holdout hit rate |
|---|---:|---:|---:|---:|---:|
| T1 | 1.5R | 5 | 39.93% | 41.3% | 31.86% |
| T2 | 2R | 10 | 29.78% | 26.09% | 27.43% |
| T3 | 3R | 15 | 19.12% | 20% | 13.04% |

## Interpretation

A high in-sample win rate is not accepted unless it persists in both later periods with positive expectancy and a useful sample. Delivery and volume remain probabilistic clues, not proof of a named institution or its hedge. The live OS should not be changed solely to force a 65% headline.
