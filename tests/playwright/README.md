# Playwright multi-league test

The test uses an isolated Turso database and an authenticated storage state. Required environment:

```bash
E2E_DATABASE_URL=...
E2E_DATABASE_TOKEN=...
E2E_STORAGE_STATE=tests/playwright/.auth/manager.json
E2E_LEAGUE_A=7
E2E_LEAGUE_B=8
E2E_AUCTION_ID=9
pnpm exec playwright test
```

The database must contain one manager participating in both leagues, two independent pending timers, and an active auction for the viewed-timer claim. The test intentionally runs two browser tabs at once.
