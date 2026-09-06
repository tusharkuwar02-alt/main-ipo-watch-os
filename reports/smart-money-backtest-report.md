# Smart Money Footprint OS — Full Historical Backtest

Generated: 2026-09-06T12:59:54.588Z

## Verdict

The point-in-time replay produced **30846 non-overlapping trades**, a **38.54% net-profitable win rate**, **15.74% target-hit rate**, **-0.193R expectancy**, and **0.631 profit factor** after 0.30% round-trip friction. This is historical evidence, not a guarantee of future profitability.

## Primary rules

- NSE EQ security-wise price, volume and deliverable-quantity archives
- Signal calculated after the daily close using only data available on that date
- Buy-stop at the OS entry level, valid for the next 3 sessions
- 1.5R target, OS stop, maximum 5-session hold
- If stop and target occur in the same daily candle, stop is counted first
- 0.30% round-trip friction; only one open/pending trade per stock
- Corporate-action-like discontinuities excluded; delisted symbols retained when present in historical files

## Coverage

| Item | Result |
|---|---:|
| Signal window | 2022-01-01 to 2026-09-04 |
| Trading sessions | 1295 |
| Historical EQ symbols | 3271 |
| Raw actionable signals | 201530 |
| Filled trades | 30846 |
| Unfilled orders | 53666 |
| Excluded corporate-action windows | 54873 |

## Primary result by year

| Year | Trades | Win rate | Target hit | Expectancy | Profit factor | Avg hold |
|---|---:|---:|---:|---:|---:|---:|
| 2022 | 4731 | 37.94% | 14.31% | -0.195R | 0.611 | 3.85 |
| 2023 | 7100 | 39.82% | 16.61% | -0.129R | 0.727 | 3.8 |
| 2024 | 7790 | 38.43% | 16.57% | -0.166R | 0.672 | 3.81 |
| 2025 | 5909 | 36.76% | 14.72% | -0.294R | 0.514 | 3.79 |
| 2026 | 5316 | 39.48% | 15.74% | -0.206R | 0.621 | 3.74 |

## By market regime

| Regime | Trades | Win rate | Target hit | Expectancy | Profit factor | Avg hold |
|---|---:|---:|---:|---:|---:|---:|
| Bearish | 4697 | 38.17% | 14.24% | -0.284R | 0.523 | 3.63 |
| Bullish | 14987 | 38.1% | 16.03% | -0.169R | 0.661 | 3.87 |
| Sideways | 11162 | 39.28% | 15.97% | -0.188R | 0.642 | 3.77 |

## By confidence

| Confidence | Trades | Win rate | Target hit | Expectancy | Profit factor | Avg hold |
|---|---:|---:|---:|---:|---:|---:|
| High | 10620 | 38.93% | 15.56% | -0.157R | 0.679 | 3.94 |
| Low | 599 | 36.56% | 15.03% | -0.25R | 0.551 | 3.57 |
| Medium | 19627 | 38.39% | 15.86% | -0.211R | 0.609 | 3.73 |

## Sensitivity

| Variant | Trades | Win rate | Target hit | Expectancy | Profit factor | Avg hold |
|---|---:|---:|---:|---:|---:|---:|
| 5d / 1.5R / 0.20% | 30846 | 39.14% | 15.74% | -0.165R | 0.672 | 3.8 |
| 5d / 1.5R / 0.30% (Primary) | 30846 | 38.54% | 15.74% | -0.193R | 0.631 | 3.8 |
| 5d / 1.5R / 0.50% | 30846 | 37.19% | 15.74% | -0.25R | 0.557 | 3.8 |
| 10d / 1.5R / 0.30% | 28496 | 38.12% | 25.34% | -0.197R | 0.687 | 5.64 |
| 10d / 2.5R / 0.30% | 27248 | 35.08% | 10.95% | -0.205R | 0.69 | 6.43 |
| 20d / 2.5R / 0.30% | 24958 | 31.89% | 18.88% | -0.186R | 0.756 | 9.09 |

## Important limitations

Daily candles do not reveal intraday path, so same-candle ambiguity is resolved conservatively. Delivery/volume footprints cannot identify a specific institution or link its cash position to its hedge. Corporate actions are detected heuristically rather than from a fully adjusted point-in-time corporate-action master. Trade-sequence drawdown is not a capital-weighted portfolio drawdown because many different stocks can overlap. Results can degrade through future regime change, gaps, liquidity, and execution costs.
