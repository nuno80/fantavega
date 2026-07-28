# Final database audit report

Date: 2026-07-28

## Scope

Reviewed the canonical schema, the versioned SQL migrations, the heartbeat/session changes, response timers, and the existing CI/test scripts.

## Result

The canonical schema initializes successfully on an empty SQLite database and supports representative inserts across users, leagues, participants, auctions, bids, auto-bids, assignments, response timers, sessions, and compliance status. Foreign-key checks pass.

The compliance `updated_at` trigger is now keyed by `(league_id, user_id, phase_identifier)`, matching the table primary key. PR15 contains that correction and its production migration.

## Migration findings fixed in this PR

### P1: stale response-timer column name

`add_last_reset_at_to_response_timers.sql` referenced `notified_at`, which does not exist in the canonical schema. It now adds `last_reset_at` and backfills it from `activated_at` or `created_at`.

### P1: incompatible timer table rebuild

`fix_response_timers_unique_constraint.sql` assumed an older timer model with `notified_at`, `action_taken`, and `deadline_missed`. Those columns and statuses are not part of the current application contract. The unsafe rebuild has been retired as a traceability-only migration instead of risking data loss or a failed deployment.

## Residual risks

1. Existing Turso migration history must be checked before applying any SQL manually. Do not replay historical migrations blindly.
2. The repository-level schema test cannot prove the production database has every migration applied.
3. Socket.IO, Clerk, Railway, Turso credentials, CORS, and live timer behavior still require environment-level verification.
4. The current heartbeat model is user-level, not browser-session-level. It handles stale users well but does not distinguish two simultaneous Clerk/browser sessions.

## Priorities

- P0: run the new database-audit CI job and the existing type-check, unit, and E2E suites.
- P0: verify Turso schema with `PRAGMA table_info(...)`, indexes, and trigger definitions before deployment.
- P1: add a migration ledger with one-time application tracking, if production migrations are currently run manually.
- P1: add browser smoke tests for hard-close, reconnect, two tabs, and delayed network responses.
- P2: measure auction-state p95 latency and scheduler/Turso query volume before further performance tuning.

## Verdict

The schema and migration contract is materially safer after this PR, but production readiness still depends on CI passing and a live Turso verification. No destructive database operation is included here.
