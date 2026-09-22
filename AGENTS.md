# Stock Watcher

Private Denmark-stock dashboard. React is served by a Cloudflare Worker; the same Worker owns the Hono API and D1 database access.

## Layout

- `src/frontend.tsx`: React dashboard and API client.
- `src/worker.ts`: Worker routes, Yahoo client, D1 persistence, manual sync, and Telegram alerts.
- `src/shared.ts`: Danish ticker validation and small domain rules.
- `migrations/`: D1 schema migrations.
- `tests/`: Node test coverage; no real Yahoo or Telegram calls.

## Working agreement

- Run `npm test` and `npm run build` after changing behavior.
- Preserve `SYMBOL_DK` validation and bound all D1 values with prepared-statement parameters.
- The Nasdaq Copenhagen screener supplies the symbol picker; Yahoo Finance supplies chart history. Keep the picker cached and avoid per-keystroke provider requests.
- Data refresh is manual only: do not add a Cron Trigger or background sync without an explicit request.
- Daily bars are the source for weekly and monthly chart aggregation; do not add duplicate interval tables without a measured need.
- D1 migrations are append-only. Apply each new migration to both local and remote databases.
