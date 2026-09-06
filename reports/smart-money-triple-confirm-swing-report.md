# Smart Money Triple-Confirm Swing - 2 to 10 Day Backtest

Generated: 2026-09-06T13:51:50.551Z

## Direct decision

The locked pre-holdout gate selected **Deep-pullback + 50% at 1.5R / 50% at 2.5R; BE** as deployable. Untouched 2026: 185 trades, 53.51% win rate, 0.236R expectancy, 1.565 profit factor. It did not establish a robust 60-70% win rate.

## Three core indicators

1. Volatility-adjusted 6/12-month relative momentum rank.
2. RSI(2) oversold pullback.
3. ATR(14) as a fast-movement filter.

Smart Money Footprint is prior stock-selection evidence, not a fourth timing trigger. Additional controls: price above a rising SMA50, near the 52-week high, liquid turnover, subdued pullback volume, and non-hostile broad-market regime.

## Locked execution

- Official NSE EQ daily archives; point-in-time universe
- Development 2022-2024; validation 2025; untouched 2026 through 2026-09-04
- Next-session entry; maximum 10 sessions; 0.30% round-trip friction
- T1 never below 1.5R; T2 2.5R; conservative stop-first same-bar handling
- Minimum samples 200/60; deployable requires expectancy > 0 and PF > 1 in both development and validation

## All pre-holdout calibrations

| Rank | Entry calibration | Management | Development trades / WR / Exp / PF | Validation trades / WR / Exp / PF | Sample OK | Deployable |
|---:|---|---|---:|---:|---:|---:|
| 1 | Deep-pullback | 50% at 1.5R / 50% at 2.5R; BE | 668 / 48.65% / 0.083R / 1.17 | 105 / 49.52% / 0.11R / 1.222 | Yes | Yes |
| 2 | Deep-pullback | 75% at 1.5R / 25% at 2.5R; lock 0.25R | 668 / 48.8% / 0.079R / 1.166 | 105 / 49.52% / 0.089R / 1.18 | Yes | Yes |
| 3 | Deep-pullback | 75% at 1.5R / 25% at 2.5R; BE | 668 / 48.65% / 0.079R / 1.164 | 105 / 49.52% / 0.092R / 1.186 | Yes | Yes |
| 4 | Deep-pullback | 100% at 1.5R | 669 / 49.03% / 0.076R / 1.161 | 105 / 49.52% / 0.074R / 1.15 | Yes | Yes |
| 5 | Balanced | 50% at 1.5R / 50% at 2.5R; BE | 805 / 47.95% / 0.082R / 1.169 | 157 / 40.76% / -0.052R / 0.909 | Yes | No |
| 6 | Balanced | 75% at 1.5R / 25% at 2.5R; BE | 805 / 47.95% / 0.067R / 1.138 | 157 / 40.76% / -0.067R / 0.883 | Yes | No |
| 7 | Balanced | 75% at 1.5R / 25% at 2.5R; lock 0.25R | 805 / 47.95% / 0.066R / 1.137 | 158 / 40.51% / -0.074R / 0.872 | Yes | No |
| 8 | Balanced | 100% at 1.5R | 807 / 47.96% / 0.052R / 1.108 | 158 / 40.51% / -0.089R / 0.847 | Yes | No |
| 9 | Precision | 100% at 1.5R | 236 / 48.31% / 0.038R / 1.074 | 55 / 41.82% / -0.095R / 0.83 | No | No |
| 10 | Precision | 75% at 1.5R / 25% at 2.5R; lock 0.25R | 236 / 48.31% / 0.063R / 1.122 | 55 / 41.82% / -0.128R / 0.772 | No | No |
| 11 | Precision | 75% at 1.5R / 25% at 2.5R; BE | 236 / 48.31% / 0.061R / 1.119 | 55 / 41.82% / -0.132R / 0.764 | No | No |
| 12 | Precision | 50% at 1.5R / 50% at 2.5R; BE | 236 / 48.31% / 0.084R / 1.164 | 55 / 41.82% / -0.169R / 0.698 | No | No |
| 13 | Reversal-confirmed | 50% at 1.5R / 50% at 2.5R; BE | 372 / 42.74% / 0.035R / 1.068 | 63 / 33.33% / -0.264R / 0.613 | Yes | No |
| 14 | Reversal-confirmed | 75% at 1.5R / 25% at 2.5R; BE | 372 / 42.74% / 0.012R / 1.023 | 63 / 33.33% / -0.283R / 0.586 | Yes | No |
| 15 | Reversal-confirmed | 100% at 1.5R | 372 / 42.74% / -0.011R / 0.979 | 63 / 33.33% / -0.301R / 0.559 | Yes | No |
| 16 | Reversal-confirmed | 75% at 1.5R / 25% at 2.5R; lock 0.25R | 372 / 42.74% / 0.011R / 1.021 | 63 / 33.33% / -0.298R / 0.564 | Yes | No |

## Frozen result

- Development: 668 / 48.65% / 0.083R / 1.17
- Validation: 105 / 49.52% / 0.11R / 1.222
- Untouched 2026: 185 / 53.51% / 0.236R / 1.565; Wilson lower 95% win-rate bound 46.33%

Research only; no future return is guaranteed.
