# Final audit report

Date: 2026-07-27. Deployment: Vercel (Next.js), Railway (Socket.IO and scheduler), Turso (libSQL).

## Assessment

The ghost-session design is substantially hardened: stale sessions are reaped, return requests recreate liveness, timer activation uses the latest liveness timestamp, and automated API/timer tests exist. The public Vercel landing page is reachable.

Allowing users to view friends' leagues is acceptable as an explicit read-only product policy. Writes, private notifications, emails, and auto-bid maximums must remain protected.

## Live audit limits

Vercel was checked publicly and returned the FantaVega landing page. Railway's public URL is not present in the repository configuration or discoverable reliably from public search. Turso cannot be inspected without credentials. Provider environment variables, live Socket.IO handshake behavior, and production migration state therefore remain unverified.

## Release blockers

1. Verify the two P0 source fixes in the deployed commit.
2. Verify Railway has Clerk verification keys, `SOCKET_EMIT_SECRET`, and production `ALLOWED_ORIGINS`.
3. Verify Turso has `last_heartbeat` and the timer/session indexes.
4. Run `pnpm test:run`, `pnpm test:e2e`, and the two-tab hard-close smoke test.

## Residual risk

- High: provider configuration and Turso migration state are unknown until live checks run.
- Medium: `auction-state` performs multiple remote queries per poll.
- Medium: heartbeat writes occur on polling requests and should be monitored/throttled.
- Low: periodic scheduler remains, now at a reasonable 15 seconds.
