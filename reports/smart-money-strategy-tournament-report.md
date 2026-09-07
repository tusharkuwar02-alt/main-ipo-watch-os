# Smart Money Footprint — Independent Strategy Tournament

Generated: 2026-09-07T04:28:28.150Z

## Direct answer

The champion was frozen using only 2022–2025 data: **Relative-strength leader breakout with 2.5R fixed target**. Its untouched 2026 test produced **39.34% win rate**, **-0.15R expectancy**, **0.672 profit factor**, and **1.036 realized payoff** over 1215 trades. No frozen strategy maintained a genuine 65% win rate with positive expectancy across development, validation, and untouched holdout.

Smart Money was used only as a setup-independent stock-selection layer. It did not decide the entry or exit; each strategy supplied its own setup, entry, and initial stop.

## Locked test design

- NSE historical EQ universe; official NSE daily price, volume, turnover, and delivery archives
- Development: 2022–2024; validation: 2025; untouched test: 2026 through 2026-09-04
- 0.30% round-trip charges/slippage; next-session entry; conservative stop-first handling when stop and target share a daily bar
- Maximum five sessions; stop or target may exit earlier
- Exit choices: 1.5R, 2R, 2.5R, or trail activated only after 1.5R and then managed with a 1.5ATR stop
- Minimum sample gate: 200 development and 60 validation trades
- A deployable variant required positive expectancy and profit factor above 1 in both development and validation
- One exit was frozen per strategy and the overall champion was frozen before any 2026 result was summarized

## Setup-independent Smart Money selector

The selector required price >= Rs20, average 20-day turnover >= Rs10 crore, footprint score >=50, no more than three distribution days, and either an institutional-style surge day or delivered-value ratio >=1.15. The score used delivery expansion, up-day versus down-day volume, surge/distribution days, and delivered-value trend. It did not require a breakout, VCP, pullback, gap, or moving-average entry.

## Strategy rules

| Strategy | Setup and entry | Initial stop |
|---|---|---|
| VCP / Contraction breakout | ATR and 5-day range contract; rising 21/50-day trend; buy above contraction high | Higher of contraction low or 1.75ATR |
| Relative-strength leader breakout | Top 15% 63-day RS; 20-day breakout; rising trend | Higher of 5-day low or 1.75ATR |
| Breakout + volume confirmation | 20-day closing breakout; volume >=1.5x; close-location >=0.65 | Higher of signal low or 1.75ATR |
| Momentum pullback | 10-day return >=8%; controlled pullback near rising SMA21 | Below signal low and at least 1.35ATR |
| Gap-up continuation | 2–8% gap; strong close; volume >=1.3x | Higher of signal low or 2ATR |
| Trend-following ATR trail | 10-day trend resumption; rising SMA21/SMA50; RS percentile >=60 | Higher of 10-day low or 2ATR |

## All 24 variants — selection used only these columns

| Rank | Strategy | Exit | Development trades / WR / Exp / PF | Validation trades / WR / Exp / PF | Sample OK | Deployable |
|---:|---|---|---:|---:|---:|---:|
| 1 | Relative-strength leader breakout | 2.5R fixed target | 3370 / 42.02% / -0.066R / 0.846 | 1243 / 41.91% / -0.073R / 0.818 | Yes | No |
| 2 | Relative-strength leader breakout | 1.5R fixed target | 3424 / 42.46% / -0.07R / 0.835 | 1258 / 42.45% / -0.074R / 0.813 | Yes | No |
| 3 | Relative-strength leader breakout | 2R fixed target | 3382 / 42.05% / -0.063R / 0.852 | 1248 / 41.99% / -0.075R / 0.813 | Yes | No |
| 4 | Trend-following ATR trail | 2.5R fixed target | 7536 / 43.78% / -0.013R / 0.963 | 2251 / 41.71% / -0.085R / 0.758 | Yes | No |
| 5 | Trend-following ATR trail | 1.5R fixed target | 7657 / 44.35% / -0.026R / 0.924 | 2275 / 42.11% / -0.089R / 0.744 | Yes | No |
| 6 | Relative-strength leader breakout | 1.5R activation + 1.5ATR trail | 3359 / 42.21% / -0.08R / 0.811 | 1245 / 42.01% / -0.105R / 0.737 | Yes | No |
| 7 | Trend-following ATR trail | 2R fixed target | 7571 / 43.88% / -0.019R / 0.946 | 2261 / 41.71% / -0.091R / 0.741 | Yes | No |
| 8 | Trend-following ATR trail | 1.5R activation + 1.5ATR trail | 7501 / 43.51% / 0.001R / 1.004 | 2251 / 41.67% / -0.098R / 0.718 | Yes | No |
| 9 | Breakout + volume confirmation | 2.5R fixed target | 7271 / 39.64% / -0.112R / 0.76 | 2083 / 39.65% / -0.137R / 0.708 | Yes | No |
| 10 | Breakout + volume confirmation | 2R fixed target | 7305 / 39.85% / -0.111R / 0.761 | 2086 / 39.79% / -0.138R / 0.706 | Yes | No |
| 11 | Breakout + volume confirmation | 1.5R fixed target | 7362 / 40.64% / -0.116R / 0.748 | 2099 / 40.3% / -0.144R / 0.692 | Yes | No |
| 12 | Gap-up continuation | 2.5R fixed target | 768 / 40.36% / -0.101R / 0.806 | 296 / 50% / 0.109R / 1.272 | Yes | No |
| 13 | Gap-up continuation | 1.5R fixed target | 770 / 41.95% / -0.115R / 0.774 | 296 / 51.01% / 0.061R / 1.159 | Yes | No |
| 14 | Gap-up continuation | 2R fixed target | 768 / 40.89% / -0.113R / 0.78 | 296 / 50.34% / 0.088R / 1.225 | Yes | No |
| 15 | Breakout + volume confirmation | 1.5R activation + 1.5ATR trail | 7260 / 39.66% / -0.128R / 0.725 | 2079 / 39.54% / -0.16R / 0.656 | Yes | No |
| 16 | Gap-up continuation | 1.5R activation + 1.5ATR trail | 768 / 39.97% / -0.128R / 0.752 | 296 / 49.66% / 0.096R / 1.247 | Yes | No |
| 17 | VCP / Contraction breakout | 1.5R fixed target | 2809 / 44.04% / -0.048R / 0.887 | 875 / 37.83% / -0.192R / 0.614 | Yes | No |
| 18 | VCP / Contraction breakout | 2R fixed target | 2802 / 43.54% / -0.04R / 0.906 | 875 / 37.14% / -0.196R / 0.607 | Yes | No |
| 19 | VCP / Contraction breakout | 2.5R fixed target | 2802 / 43.25% / -0.039R / 0.91 | 874 / 36.96% / -0.203R / 0.592 | Yes | No |
| 20 | VCP / Contraction breakout | 1.5R activation + 1.5ATR trail | 2800 / 42.89% / -0.054R / 0.874 | 875 / 36.69% / -0.218R / 0.564 | Yes | No |
| 21 | Momentum pullback | 2R fixed target | 48 / 29.17% / -0.222R / 0.494 | 28 / 50% / 0.031R / 1.074 | No | No |
| 22 | Momentum pullback | 1.5R activation + 1.5ATR trail | 48 / 29.17% / -0.241R / 0.45 | 28 / 50% / 0.011R / 1.027 | No | No |
| 23 | Momentum pullback | 2.5R fixed target | 48 / 29.17% / -0.241R / 0.45 | 28 / 50% / 0.053R / 1.123 | No | No |
| 24 | Momentum pullback | 1.5R fixed target | 48 / 29.17% / -0.253R / 0.424 | 28 / 50% / 0.011R / 1.027 | No | No |

## Frozen family finalists and untouched 2026

| Strategy | Frozen exit | Development trades / WR / Exp / PF | Validation trades / WR / Exp / PF | 2026 trades / WR / Exp / PF | 2026 WR lower 95% |
|---|---|---:|---:|---:|---:|
| VCP / Contraction breakout | 1.5R fixed target | 2809 / 44.04% / -0.048R / 0.887 | 875 / 37.83% / -0.192R / 0.614 | 766 / 37.47% / -0.182R / 0.632 | 34.11% |
| Relative-strength leader breakout | 2.5R fixed target | 3370 / 42.02% / -0.066R / 0.846 | 1243 / 41.91% / -0.073R / 0.818 | 1215 / 39.34% / -0.15R / 0.672 | 36.63% |
| Breakout + volume confirmation | 2.5R fixed target | 7271 / 39.64% / -0.112R / 0.76 | 2083 / 39.65% / -0.137R / 0.708 | 1873 / 40.58% / -0.132R / 0.716 | 38.37% |
| Momentum pullback | 2R fixed target | 48 / 29.17% / -0.222R / 0.494 | 28 / 50% / 0.031R / 1.074 | 12 / 58.33% / 0.259R / 1.913 | 31.95% |
| Gap-up continuation | 2.5R fixed target | 768 / 40.36% / -0.101R / 0.806 | 296 / 50% / 0.109R / 1.272 | 350 / 47.14% / 0.042R / 1.109 | 41.97% |
| Trend-following ATR trail | 2.5R fixed target | 7536 / 43.78% / -0.013R / 0.963 | 2251 / 41.71% / -0.085R / 0.758 | 2005 / 41.2% / -0.075R / 0.792 | 39.06% |

## Decision

The overall champion remains the pre-holdout winner even if another family happened to score better in 2026. That prevents selecting a rule after seeing the test set. A 65% headline is rejected when it comes from a small sample or does not persist across all three periods. This report is research, not a guarantee of future returns.
