# FantaVega final audit checklist

Use the checkboxes as the release gate. Do not mark an item complete from source inspection alone when it requires a live provider check.

## P0: required before release

- [ ] `database/schema.sql` contains no hardcoded admin identity or email.
- [ ] `auction-state` roster SQL contains `pa.user_id` without JavaScript `//` syntax.
- [ ] `pnpm test:run` passes on the merge commit.
- [ ] `pnpm test:e2e` passes on the merge commit.
- [ ] Vercel production returns the public home page successfully.
- [ ] Vercel unauthenticated API request returns `401`, not application data.
- [ ] Railway `/api/emit` returns `401` without `x-emit-secret`.
- [ ] Railway accepts only the configured production CORS origin.
- [ ] Railway rejects a Socket.IO handshake without a valid Clerk token.
- [ ] Railway derives the private room from the verified token, never from a client-supplied user ID.
- [ ] Turso has `user_sessions.last_heartbeat`.
- [ ] Turso has the response-timer and session indexes from the versioned migrations.
- [ ] Turso migration was applied without resetting production data.

## P1: security and correctness

- [ ] All auction write endpoints validate the authenticated user and target league/auction ownership rules.
- [ ] Public league viewing policy is documented as read-only and excludes emails, auto-bid maximums, and private notifications.
- [ ] Admin role is provisioned through a controlled seed or Clerk metadata, not schema side effects.
- [ ] Two-tab test passes: closing one tab does not close the user's active session.
- [ ] Hard-close test passes: no timer deadline is created while the user is away.
- [ ] Return test passes: timer starts from the return heartbeat and grants a full response window.
- [ ] Timer expiry is idempotent under two concurrent scheduler runs.

## P2: performance and operations

- [ ] `auction-state` p95 latency is recorded before and after deployment.
- [ ] Turso query volume for polling and scheduler is recorded.
- [ ] Heartbeat writes are monitored and remain within the expected budget.
- [ ] Scheduler interval and timer processing delay are monitored.
- [ ] Socket reconnects and authentication failures are monitored.
- [ ] Vercel and Railway logs contain no Clerk tokens, emails, or auto-bid maximums.

## Live checks

```bash
curl -i https://fantavega.vercel.app/
curl -i 'https://fantavega.vercel.app/api/user/auction-states?leagueId=1'
# Railway requires the real public Railway URL and configured secret.
curl -i -X POST https://<railway-host>/api/emit
```

Turso requires a trusted environment with credentials:

```sql
PRAGMA table_info(user_sessions);
SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('idx_user_sessions_heartbeat', 'idx_response_timers_status_deadline');
```
