# Institutional Fast-Mover RR2 — 1 to 10 Session Backtest

Generated: 2026-09-06T14:20:32.429Z

## Direct answer

The locked 2022-2025 gate selected **Deep leader pullback + 50% at 2R / 50% at 3R; BE**. It is the single frozen candidate evaluated on 2026.

Untouched 2026: 185 trades, 52.43% profitable trades, 0.273R expectancy and 1.637 profit factor. It did not establish a robust 60-70% win rate.

## What was tested

Five distinct entry families: deep leader pullback, VCP momentum ignition, volume-confirmed breakout, gap continuation and trend resumption. Each combines (1) volatility-adjusted 6/12-month relative momentum, (2) ATR fast-movement and trend/regime controls, and (3) a family-specific price/volume trigger. Smart Money Footprint must already be present before the signal.

Five exits were applied equally to each family. Every first profit objective is **2R** and every second objective is **3R**; no 1.5R target was allowed.

## Locked test protocol

- Official NSE EQ daily archives; point-in-time daily universe
- Development 2022-2024; validation 2025; untouched 2026 through 2026-09-04
- Entry no earlier than the next session; maximum 10 sessions
- 0.30% round-trip friction; gap fills and stop-first same-bar ambiguity
- One open trade per stock; corporate-action discontinuities excluded
- Minimum samples 180/50
- Deployable gate: positive expectancy and PF >= 1.10 in both development and validation
- 2026 had zero influence on selection

## Pre-holdout tournament

| Rank | Entry family | Exit | Development trades / WR / Exp / PF | Validation trades / WR / Exp / PF | Sample OK | Gate passed |
|---:|---|---|---:|---:|---:|---:|
| 1 | Deep leader pullback | 50% at 2R / 50% at 3R; BE | 665 / 46.92% / 0.102R / 1.202 | 105 / 46.67% / 0.122R / 1.236 | Yes | Yes |
| 2 | Deep leader pullback | 50% at 2R / 50% at 3R; two-day low | 667 / 46.93% / 0.098R / 1.196 | 105 / 46.67% / 0.115R / 1.222 | Yes | Yes |
| 3 | Deep leader pullback | 75% at 2R / 25% at 3R; BE | 665 / 47.07% / 0.094R / 1.189 | 105 / 46.67% / 0.113R / 1.218 | Yes | Yes |
| 4 | Deep leader pullback | 75% at 2R / 25% at 3R; lock 0.25R | 665 / 47.07% / 0.093R / 1.188 | 105 / 46.67% / 0.114R / 1.22 | Yes | Yes |
| 5 | Deep leader pullback | 100% at 2R | 667 / 47.23% / 0.087R / 1.176 | 105 / 46.67% / 0.103R / 1.199 | Yes | Yes |
| 6 | Volume-confirmed breakout | 50% at 2R / 50% at 3R; two-day low | 1243 / 39.98% / -0.069R / 0.89 | 180 / 43.33% / -0.004R / 0.992 | Yes | No |
| 7 | Volume-confirmed breakout | 50% at 2R / 50% at 3R; BE | 1242 / 39.94% / -0.071R / 0.888 | 179 / 43.58% / 0.007R / 1.013 | Yes | No |
| 8 | Volume-confirmed breakout | 75% at 2R / 25% at 3R; BE | 1242 / 39.94% / -0.076R / 0.879 | 179 / 43.58% / 0R / 1 | Yes | No |
| 9 | Volume-confirmed breakout | 75% at 2R / 25% at 3R; lock 0.25R | 1243 / 39.9% / -0.077R / 0.877 | 179 / 43.58% / 0.001R / 1.002 | Yes | No |
| 10 | Volume-confirmed breakout | 100% at 2R | 1263 / 39.75% / -0.085R / 0.865 | 182 / 43.41% / 0.001R / 1.001 | Yes | No |
| 11 | Trend resumption | 50% at 2R / 50% at 3R; BE | 1499 / 41.36% / -0.045R / 0.923 | 226 / 41.15% / -0.141R / 0.757 | Yes | No |
| 12 | Trend resumption | 75% at 2R / 25% at 3R; lock 0.25R | 1499 / 41.36% / -0.053R / 0.909 | 226 / 41.15% / -0.147R / 0.747 | Yes | No |
| 13 | Trend resumption | 75% at 2R / 25% at 3R; BE | 1499 / 41.36% / -0.051R / 0.913 | 226 / 41.15% / -0.147R / 0.747 | Yes | No |
| 14 | Trend resumption | 50% at 2R / 50% at 3R; two-day low | 1502 / 41.28% / -0.051R / 0.912 | 227 / 40.97% / -0.151R / 0.74 | Yes | No |
| 15 | Trend resumption | 100% at 2R | 1532 / 41.06% / -0.064R / 0.89 | 228 / 40.79% / -0.155R / 0.734 | Yes | No |
| 16 | Gap continuation | 50% at 2R / 50% at 3R; two-day low | 171 / 34.5% / -0.244R / 0.679 | 14 / 42.86% / -0.2R / 0.671 | No | No |
| 17 | Gap continuation | 75% at 2R / 25% at 3R; lock 0.25R | 171 / 34.5% / -0.252R / 0.662 | 14 / 42.86% / -0.143R / 0.765 | No | No |
| 18 | Gap continuation | 50% at 2R / 50% at 3R; BE | 171 / 34.5% / -0.252R / 0.668 | 14 / 42.86% / -0.137R / 0.774 | No | No |
| 19 | Gap continuation | 100% at 2R | 171 / 35.09% / -0.254R / 0.658 | 14 / 42.86% / -0.148R / 0.756 | No | No |
| 20 | Gap continuation | 75% at 2R / 25% at 3R; BE | 171 / 34.5% / -0.253R / 0.661 | 14 / 42.86% / -0.143R / 0.765 | No | No |
| 21 | VCP momentum ignition | 100% at 2R | 633 / 40.92% / -0.028R / 0.952 | 88 / 31.82% / -0.401R / 0.415 | Yes | No |
| 22 | VCP momentum ignition | 50% at 2R / 50% at 3R; two-day low | 630 / 40.95% / -0.003R / 0.995 | 88 / 31.82% / -0.406R / 0.408 | Yes | No |
| 23 | VCP momentum ignition | 75% at 2R / 25% at 3R; lock 0.25R | 630 / 40.95% / -0.011R / 0.981 | 88 / 31.82% / -0.409R / 0.404 | Yes | No |
| 24 | VCP momentum ignition | 75% at 2R / 25% at 3R; BE | 630 / 40.95% / -0.012R / 0.979 | 88 / 31.82% / -0.41R / 0.402 | Yes | No |
| 25 | VCP momentum ignition | 50% at 2R / 50% at 3R; BE | 630 / 40.95% / 0.002R / 1.003 | 88 / 31.82% / -0.42R / 0.388 | Yes | No |

## Frozen result

- Development: 665 / 46.92% / 0.102R / 1.202
- Validation: 105 / 46.67% / 0.122R / 1.236
- Untouched 2026: 185 / 52.43% / 0.273R / 1.637
- 2026 95% Wilson lower win-rate bound: 45.26%
- Average 2026 winner/loss: 1.337R / -0.9R
- Average 2026 holding: 7.56 sessions

## Interpretation

A 2R target mechanically requires fewer than 50% winners to be profitable before costs, but real trades also include time exits, gaps and friction. Therefore win rate alone is not the approval metric. Permanent profit or a fixed 60-70% win rate cannot be guaranteed by any honest historical test.

Research only; position sizing and forward/paper validation remain mandatory before capital is exposed.
