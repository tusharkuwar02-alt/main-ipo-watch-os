# Smart Money Quality Momentum Pullback — Full Backtest

Generated: 2026-09-06T13:30:25.927Z

## Direct decision

**No tested QMP variant passed the locked pre-holdout deployability gate.** The highest-ranked variant is shown only as the frozen research candidate, not as a live recommendation. The frozen variant produced 219 untouched 2026 trades, 39.73% win rate, -0.111R expectancy, and 0.722 profit factor.

## Exact architecture

The selector uses cross-sectional 6- and 12-month returns divided by matching daily volatility, z-score normalization, and a percentile rank. It then requires a leader near its 52-week high, a rising 50-day trend, a controlled four-day pullback near EMA10/EMA20 on subdued volume, an earlier Smart Money footprint, and a positive market regime. Entry is a next-session stop order; exits are tested independently.

## Locked test design

- Official NSE historical EQ daily archives; point-in-time universe
- Development 2022–2024; validation 2025; untouched 2026 through 2026-09-04
- 0.30% round-trip charges/slippage; conservative stop-first same-bar handling
- Maximum five holding sessions; no overlapping position in the same symbol and variant
- Minimum sample: 200 development and 60 validation trades
- Deployable only if expectancy > 0 and profit factor > 1 in both development and validation
- 2026 was summarized only after the variant had been frozen

## All 16 variants — pre-holdout selection only

| Rank | Setup | Exit | Development trades / WR / Exp / PF | Validation trades / WR / Exp / PF | Sample OK | Deployable |
|---:|---|---|---:|---:|---:|---:|
| 1 | ATR-stop QMP | 1.5R activation + 1.5ATR trail | 1158 / 48.7% / 0.031R / 1.088 | 206 / 40.78% / -0.164R / 0.636 | Yes | No |
| 2 | ATR-stop QMP | 1.5R fixed target | 1159 / 49.18% / 0.017R / 1.05 | 206 / 41.26% / -0.17R / 0.621 | Yes | No |
| 3 | ATR-stop QMP | 2.5R fixed target | 1158 / 48.79% / 0.032R / 1.092 | 206 / 39.81% / -0.183R / 0.594 | Yes | No |
| 4 | ATR-stop QMP | 2R fixed target | 1158 / 48.88% / 0.03R / 1.086 | 206 / 39.81% / -0.194R / 0.572 | Yes | No |
| 5 | Selective QMP | 2.5R fixed target | 285 / 46.32% / 0.031R / 1.065 | 51 / 35.29% / -0.24R / 0.616 | No | No |
| 6 | Balanced QMP | 1.5R fixed target | 1460 / 46.16% / -0.015R / 0.966 | 236 / 34.75% / -0.244R / 0.529 | Yes | No |
| 7 | Selective QMP | 1.5R activation + 1.5ATR trail | 285 / 45.26% / 0.067R / 1.142 | 51 / 35.29% / -0.239R / 0.604 | No | No |
| 8 | Selective QMP | 1.5R fixed target | 285 / 48.77% / 0.007R / 1.016 | 51 / 37.25% / -0.26R / 0.568 | No | No |
| 9 | Balanced QMP | 2R fixed target | 1457 / 45.44% / -0.004R / 0.991 | 236 / 33.9% / -0.258R / 0.507 | Yes | No |
| 10 | Balanced QMP | 2.5R fixed target | 1457 / 45.09% / 0.006R / 1.013 | 236 / 33.47% / -0.273R / 0.48 | Yes | No |
| 11 | Balanced QMP | 1.5R activation + 1.5ATR trail | 1458 / 44.58% / -0.005R / 0.989 | 236 / 33.05% / -0.277R / 0.467 | Yes | No |
| 12 | Selective QMP | 2R fixed target | 285 / 47.37% / 0.037R / 1.078 | 51 / 35.29% / -0.284R / 0.545 | No | No |
| 13 | Gradual-leader QMP | 2R fixed target | 515 / 45.05% / -0.029R / 0.933 | 89 / 34.83% / -0.296R / 0.484 | Yes | No |
| 14 | Gradual-leader QMP | 1.5R activation + 1.5ATR trail | 516 / 44.38% / -0.014R / 0.966 | 89 / 34.83% / -0.296R / 0.484 | Yes | No |
| 15 | Gradual-leader QMP | 2.5R fixed target | 514 / 44.75% / -0.019R / 0.957 | 89 / 34.83% / -0.303R / 0.472 | Yes | No |
| 16 | Gradual-leader QMP | 1.5R fixed target | 518 / 46.33% / -0.029R / 0.932 | 89 / 34.83% / -0.306R / 0.467 | Yes | No |

## Frozen candidate and untouched result

- Setup: ATR-stop QMP
- Exit: 1.5R activation + 1.5ATR trail
- Development: 1158 / 48.7% / 0.031R / 1.088
- Validation: 206 / 40.78% / -0.164R / 0.636
- Untouched 2026: 219 / 39.73% / -0.111R / 0.722; 95% Wilson lower win-rate bound 33.48%

This is research, not a guarantee of future returns.
