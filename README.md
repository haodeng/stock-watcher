# Stock Watcher

Private Denmark-stock dashboard: React frontend, Cloudflare Worker API, D1 storage, manual Yahoo Finance syncing, and Telegram price alerts.

## Setup

```sh
npm install
npx wrangler d1 create stock-watcher
# Put the returned database_id in wrangler.jsonc.
npx wrangler d1 execute stock-watcher --local --file=migrations/0001_initial.sql
npx wrangler d1 execute stock-watcher --file=migrations/0001_initial.sql --remote
npx wrangler d1 execute stock-watcher --local --file=migrations/0002_stock_notes.sql
npx wrangler d1 execute stock-watcher --file=migrations/0002_stock_notes.sql --remote
npx wrangler d1 execute stock-watcher --local --file=migrations/0003_note_timestamp.sql
npx wrangler d1 execute stock-watcher --file=migrations/0003_note_timestamp.sql --remote
npx wrangler secret put APP_ACCESS_KEY
npx wrangler secret put SESSION_SECRET
npm run dev
```

For local development, create `.dev.vars` with `APP_ACCESS_KEY` and `SESSION_SECRET`. Optional Telegram alerts need `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` Worker secrets. Run `npm test` and `npm run build` before deployment.

## Using the app

Sign in and choose **Add symbol** to search Nasdaq Copenhagen listings. Select one or more stocks, then choose **Add selected**; batch additions wait for a manual sync. Select 1D, 1W, 1M, 4H, or 1H charts. Weekly and monthly candles are derived from daily bars. Use the pencil or copy icons in the watchlist header to rename a watchlist or copy the selected stock to another list.

Each stock can have one note. Its preview appears beside the chart ticker; use the editor below the chart to add, edit, or remove it. The note timestamp shows when it was last saved. The chart header also shows the Nasdaq-provided sector, and the watchlist tooltip includes it.

Data is refreshed only when you click **Sync data**, or **Sync stock** beside the chart for the selected symbol. The first sync backfills 10 years of daily and 2 years of hourly history; later syncs fetch only five recent days. It then evaluates armed price alerts. There is no scheduled sync, which avoids repeatedly hitting Yahoo Finance's undocumented rate limit.
