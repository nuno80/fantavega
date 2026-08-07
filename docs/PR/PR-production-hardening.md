# Production hardening report

## Scope

This change set addresses the highest-risk findings from the repository audit without redesigning auction rules. It protects league-scoped reads, validates response actions against the exact active timer, adds bounded realtime delivery, replaces placeholder assertions, adds concurrent timer activation coverage, and introduces mandatory quality gates.

## Security

`GET /api/leagues/:leagueId/auction-state` now checks membership before any league data is read. Admin access continues through the existing league guard. IDs use strict numeric validation, preventing partial `parseInt` acceptance.

`POST /api/leagues/:leagueId/players/:playerId/response-action` now requires league access and an exact pending timer for the user, auction and player. Cooldown is checked directly in the same query and database errors fail closed. A user already leading the auction cannot use the response endpoint to bid against themselves.

## Concurrency and reliability

Concurrent activation tests execute three racing calls and verify that the compare-and-set update produces one `response-timer-started` event and one stable deadline. Realtime delivery now has a five-second timeout and one short retry; server-side deduplication protects the retry window.

## CI

Pull requests and pushes to `main` now run frozen dependency installation, TypeScript checking, the complete Vitest suite, and the database audit. The database audit additionally proves timer uniqueness, valid status enforcement and presence of hot-path indexes.

## Risk controls

No auction pricing, budget calculation, timer duration or league configuration rule was changed. The response endpoint keeps using the existing bid and abandon services. The new checks only reject requests that were unauthorized, malformed, in cooldown, missing an active response timer, or already leading.

## Verification checklist

- `pnpm type-check`
- `pnpm test:run`
- `python3 scripts/verify-database-schema.py`
- Manual smoke test: member loads auction state
- Manual smoke test: non-member receives 403
- Manual smoke test: valid bid and fold response
- Manual smoke test: concurrent polling emits one timer start

## Follow-up work

A transactional outbox and distributed scheduler lease require a schema migration plus deployment coordination. They are intentionally excluded from this low-risk patch rather than introducing infrastructure behavior without a staged rollout. Service decomposition is also a separate refactor after these regression gates are green.
