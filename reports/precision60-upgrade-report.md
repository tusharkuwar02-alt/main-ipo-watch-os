# Precision60 RR2 Upgrade - Backtest Report

Generated: 2026-09-06T14:41:59.122Z

## Direct answer

No row reached 60% in both pre-2026 splits; **M90 leader** is only the strongest profitable comparator.

Reused 2026 diagnostic: 99 trades, 54.55% win rate, 0.362R expectancy, PF 1.873. Because 2026 was reviewed in the earlier study, it is not an untouched holdout for this upgrade. The upgrade did not establish a robust 60%+ win rate.

## Fixed constraints

- T1 2R and T2 3R; 50/50 exit; breakeven runner after T1
- Maximum 10 sessions; next-session execution; 0.30% friction
- Official NSE EQ archives; stop-first same-bar policy
- Minimum samples 180/50
- Precision gate: win rate >=60%, positive expectancy and PF >=1.10 in both 2022-24 and 2025

## Pre-2026 comparison

| Rank | Precision upgrade | Development trades / WR / Exp / PF | Validation trades / WR / Exp / PF | Sample OK | 60% gate |
|---:|---|---:|---:|---:|---:|
| 1 | M90 bullish rejection | 2 / 50% / 0.505R / 1.966 | 4 / 100% / 0.85R / - | No | No |
| 2 | M90 leader | 335 / 46.57% / 0.068R / 1.126 | 58 / 44.83% / 0.111R / 1.214 | Yes | No |
| 3 | M85 breadth60 | 403 / 50.12% / 0.165R / 1.336 | 49 / 42.86% / 0.07R / 1.124 | No | No |
| 4 | M90 bull regime | 308 / 47.73% / 0.092R / 1.174 | 41 / 41.46% / -0.004R / 0.994 | No | No |
| 5 | M85 confirmed rebound | 210 / 42.38% / -0.019R / 0.963 | 32 / 50% / 0.012R / 1.025 | No | No |
| 6 | M90 RSI10 | 228 / 42.54% / -0.043R / 0.923 | 39 / 35.9% / -0.09R / 0.847 | No | No |
| 7 | M90 deeper 6-12% | 124 / 42.74% / -0.111R / 0.81 | 25 / 44% / -0.016R / 0.97 | No | No |
| 8 | M95 precision | 106 / 40.57% / -0.118R / 0.801 | 14 / 35.71% / 0.023R / 1.037 | No | No |
| 9 | M90 confirmed bull regime | 128 / 46.09% / 0.035R / 1.07 | 21 / 42.86% / -0.233R / 0.606 | No | No |
| 10 | M90 gradual trend | 60 / 35% / -0.271R / 0.625 | 9 / 55.56% / 0.721R / 2.793 | No | No |

No threshold is approved merely because it reaches 60% in one slice. Research only.
