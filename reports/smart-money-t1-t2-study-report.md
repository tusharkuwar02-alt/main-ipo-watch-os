# Smart Money Footprint OS — T1/T2 Management Study

Generated: 2026-09-05T06:08:27.503Z

## Direct answer

The rule selected without using 2026 was **100% at T1**. Its untouched 2026 holdout produced **55.75% profitable trades**, **0.175R expectancy**, **1.147 realized payoff ratio**, and **1.446 profit factor** across 113 trades.

## Frozen inputs

- Entry model and filters were not re-optimized: SMA21 pullback + 1.5ATR stop; 10D return ≥8%; Breakout Triggered only; RS20 ≥10%
- Initial stop remained 1.5 ATR
- T1 remained 1.5R and T2 remained 2R
- Maximum hold remained 5 sessions
- 0.30% round-trip friction and conservative stop-first same-bar handling
- 21 bounded management variants; 2022-2024 development, 2025 validation, 2026 untouched holdout

## Top development/validation variants

| Rank | Management | Development WR / Exp / Payoff | Validation WR / Exp / Payoff |
|---:|---|---:|---:|
| 1 | 100% at T1 | 59.34% / 0.348R / 1.411 | 57.61% / 0.314R / 1.406 |
| 2 | 75% T1 / 25% T2; BE after T1 | 59.56% / 0.328R / 1.363 | 57.61% / 0.303R / 1.382 |
| 3 | 75% T1 / 25% T2; lock 0.25R | 59.56% / 0.33R / 1.366 | 57.61% / 0.301R / 1.377 |
| 4 | 75% T1 / 25% T2; 2-day-low trail | 59.56% / 0.329R / 1.364 | 57.61% / 0.3R / 1.376 |
| 5 | 75% T1 / 25% T2; 1.5ATR trail | 59.56% / 0.328R / 1.361 | 57.61% / 0.296R / 1.368 |
| 6 | 75% T1 / 25% T2; 1ATR trail | 59.34% / 0.324R / 1.361 | 57.61% / 0.295R / 1.365 |
| 7 | 75% T1 / 25% T2; initial SL | 59.56% / 0.332R / 1.369 | 57.61% / 0.296R / 1.368 |
| 8 | 50% T1 / 50% T2; BE after T1 | 59.56% / 0.304R / 1.311 | 57.61% / 0.291R / 1.357 |
| 9 | 50% T1 / 50% T2; 2-day-low trail | 59.56% / 0.305R / 1.313 | 57.61% / 0.287R / 1.347 |
| 10 | 50% T1 / 50% T2; lock 0.25R | 59.56% / 0.307R / 1.317 | 57.61% / 0.287R / 1.348 |
| 11 | 25% T1 / 75% T2; BE after T1 | 58.09% / 0.279R / 1.333 | 55.43% / 0.28R / 1.443 |
| 12 | 25% T1 / 75% T2; 2-day-low trail | 56.99% / 0.28R / 1.393 | 55.43% / 0.273R / 1.427 |

## Untouched holdout

| Trades | Win rate | T1 hit | T2 hit | Expectancy | Profit factor | Avg win | Avg loss | Payoff |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 113 | 55.75% | 31.86% | 0% | 0.175R | 1.446 | 1.015R | -0.885R | 1.147 |

## Interpretation

Partial exits change the payoff distribution; they do not create extra market edge. The selected rule is accepted only if it improves the pre-holdout objective and remains positive on the untouched holdout. The live OS is not changed by this research report.
