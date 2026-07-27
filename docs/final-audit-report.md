# Final audit report

Date: 2026-07-27
Deployment model: Vercel for Next.js, Railway for Socket.IO and scheduler, Turso for libSQL.

## Executive summary

The ghost-session design is materially improved: stale heartbeats are reaped, sessions can be recreated on return, timers are activated from the latest liveness timestamp, and automated route/timer tests exist. The Socket.IO server-to-server endpoint is secret-protected and client identity is derived from a verified Clerk token.

The product decision that users may view friends' leagues is valid, but it must be explicit. In that model, unrestricted read access is a product policy, not automatically an IDOR. Keep writes and private data separately authorized, and do not expose auto-bid maximums, emails, or private user notifications to viewers.

## Priority findings

### P0, release blocker

1. Verify the deployed `main` contains the Socket.IO Clerk handshake fix and that Railway has `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `SOCKET_EMIT_SECRET`, and `ALLOWED_ORIGINS`. If any are missing, private-room security is not active.
2. Remove the hardcoded admin seed from `database/schema.sql`. It is an integrity risk and can recreate a privileged account during a reset.
3. Fix `pa.user_id // Aggiungi user_id...` in `src/app/api/leagues/[league-id]/auction-state/route.ts`. It is invalid SQL and causes the consolidated endpoint to return partial data.

### P1, high

1. Decide and document league visibility: public read-only, members-only, or invite-only. Enforce membership for every write route even if reads remain public.
2. Verify the heartbeat migration was applied to Turso, not only committed. `CREATE TABLE IF NOT EXISTS` does not alter an existing table.
3. Run the two-tab hard-close smoke test and `pnpm test:e2e` on the release commit.

### P2, medium

1. `auction-state` performs several remote queries per poll. Measure p95 and query volume before splitting stable roster data from volatile auction data.
2. Heartbeat updates should be throttled server-side, for example only writing when the previous heartbeat is older than 30 seconds.
3. Scheduler scans remain periodic. The 15-second interval is a reasonable safety tradeoff, but a due-time scheduler would reduce idle reads further.
4. Replace broad `GROUP BY a.id` queries with deterministic aggregation or `EXISTS` subqueries.

## Security checks completed

SQL values use bound parameters in the reviewed hot paths. API authentication is present through Clerk middleware and route handlers. Debug auto-bid exposure is restricted. Server-to-socket emission is secret-protected. Socket private-room identity is no longer client-selected in the intended runtime.

## Residual acceptance criteria

Do not call the audit closed until the P0 items are verified in the deployed environment, the malformed SQL is fixed, and the league visibility policy is written down and tested.
