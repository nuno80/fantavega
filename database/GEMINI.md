# database - Schema & Data Persistence

## Package Identity
- **Role**: Data persistance layer. Defines the structure of all application data.
- **Tech**: SQLite (via Turso/LibSQL), raw SQL schema.

## Core Entities (Schema)
- `users`: Extended Clerk management.
- `auction_leagues`: League configs.
- `league_participants`: Join table with budget state.
- `players`: Global player catalouge.
- `auctions` / `bids`: The bidding engine state.
- `budget_transactions`: Audit log of all credit moves.

## Workflow
1. **Modify Schema**: Edit `database/schema.sql`.
2. **Apply Changes**: Run `pnpm db:migrate`.
3. **Seed Data**: Run `pnpm db:seed` (for dev/testing).

## Ad-Hoc Modification
For quick SQL fixes without full migration history:
1. Add SQL to `database/adhoc_changes.sql`.
2. Run `pnpm db:apply-changes`.
3. **Empty** the file after success.

## JIT Index Hints
- View Schema: `cat database/schema.sql`
- Check migrations: `ls -1 database/migrations`

## Direct DB Testing (WSL)
```bash
# General query format
sqlite3 database/starter_default.db "SELECT * FROM users LIMIT 1;"

# Reset Participant Status
sqlite3 database/starter_default.db "UPDATE auction_leagues SET status = 'participants_joining' WHERE id = 1;"
```
