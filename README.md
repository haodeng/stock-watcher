# Stock Watcher

Private Denmark-stock dashboard: React frontend, Cloudflare Worker API, D1 storage, manual Yahoo Finance syncing, and Telegram price alerts.

## Setup

```sh
npm install
npx wrangler d1 create stock-watcher
# Put the returned database_id in wrangler.jsonc.
npx wrangler d1 execute stock-watcher --local --file=migrations/0001_initial.sql
npx wrangler d1 execute stock-watcher --file=migrations/0001_initial.sql --remote
npx wrangler secret put APP_ACCESS_KEY
npx wrangler secret put SESSION_SECRET
npm run dev
```

For local development, create `.dev.vars` with `APP_ACCESS_KEY` and `SESSION_SECRET`. Optional Telegram alerts need `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` Worker secrets. Run `npm test` and `npm run build` before deployment.

## Using the app

Sign in, add a Denmark ticker such as `NDA_DK`, then select Daily, Weekly, Monthly, or Hourly charts. Weekly and monthly candles are derived from daily bars.

Data is refreshed only when you click **Sync all history**. It upserts 10 years of daily and 2 years of hourly history for every saved stock, then evaluates armed price alerts. There is no scheduled sync, which avoids repeatedly hitting Yahoo Finance's undocumented rate limit.
