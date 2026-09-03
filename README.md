# Main IPO Watch OS

Production NSE Mainboard IPO scanner using the user's locked 20-system framework.

## Locked rules

- Rolling five-year NSE `EQ` Mainboard IPO universe; SME is excluded.
- A stock appears when it matches **even one** system. There is no Top-N cap.
- Daily/Weekly SMA 21 and SMA 30 proximity use only ±2% price distance. SMA direction is displayed, never used as a filter.
- IPO Base depth must be at or below 12%.
- Volume Dry-Up requires volume at or below 60% of its 20-day average while price is within ±2% of Daily SMA21.
- Weekly-51 distinguishes a confirmed completed-week breakout from a week-in-progress signal.
- Weekly confirmation follows the official NSE holiday calendar when available and refuses to confirm against stale market data.
- IPOWatch parsing reads the actual `Listing Date` column, never `Open Date`; NSE listing master validates symbol, segment, and listing date.
- Monthly 51 and 50-Day SMA proximity are deliberately absent.

## Reliability and explanation layer

- Every qualifying stock displays every matching system, the exact trigger reason, supporting values, and signal family.
- Confluence ranking counts independent evidence families so several related breakout rules cannot artificially dominate ranking. The one-match inclusion rule remains unchanged.
- Each system includes indicative 5/10/20-session historical forward-return context from recent signals.
- Yahoo history automatically retries through a second endpoint.
- Scan quality guards block an empty, badly reduced, or failure-heavy refresh and preserve the last successful snapshot.
- The dashboard and health API expose market date, freshness, scan quality, source status, and failure counts.

## Data path

`NSE EQUITY_L.csv` → NSE `EQ`/five-year validation → IPOWatch Mainboard performance + listing-date cross-check → Yahoo NSE daily history → 20 systems → `data/latest-scan.json` → `/api/scan` and dashboard.

The GitHub Action refreshes the scan after Indian market hours on weekdays and commits the latest snapshot. Vercel automatically deploys the committed result.

## Commands

```bash
npm ci
npm test
npm run scan
npm run build
```

API endpoints: `/api/health` and `/api/scan`.
