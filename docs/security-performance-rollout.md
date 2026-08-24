# Security and performance rollout

## Before merge
1. Apply `database/migrations/add_session_liveness.sql` to the production Turso database.
2. Set `SOCKET_EMIT_SECRET` on Vercel and Railway, then deploy both services.
3. Set `ALLOWED_ORIGINS` to the production web origin only.
4. Run `pnpm lint`, `pnpm typecheck`, and `pnpm test`.

## Ghost-session regression test
1. Open an auction in two browser profiles as users A and B.
2. Let A be outbid, then hard-close A's tab without logout.
3. Confirm the timer for A remains pending and no deadline is created immediately.
4. Wait beyond the liveness threshold, reopen the auction, and confirm activation starts from the real return time, never from the stale login time.
5. Repeat with two tabs for A: closing one tab must not log A out while the second tab is active.

## Authorization tests
1. Log in as a user not enrolled in league X.
2. Request every league-scoped API with X's ID.
3. Expect HTTP 403 and no budget, roster, auto-bid, or activity data.
4. Repeat as admin and expect access.

### Sensitive route matrix

| Route class | Anonymous | Authenticated manager | Admin | Defense |
| --- | --- | --- | --- | --- |
| `/api/admin/**` | 401 | 401/403 denied | allowed | Route-level Clerk role guard plus middleware |
| `/api/admin/tasks/**` | 401 on POST | 403 on POST | allowed on POST | Shared task guard; GET returns 405 |
| `/api/debug/**` | 401 | 403 | allowed outside production | Route-level admin guard, production 404 unless explicitly enabled |
| `/admin/**`, `/dashboard/**` | sign-in redirect | no-access redirect | allowed | Clerk middleware |

Direct-handler tests cover the shared admin decision and representative admin, debug,
and task handlers so authorization remains effective when middleware is bypassed.

### Debug and task endpoint inventory

| Endpoint | Method | Production policy | Response policy |
| --- | --- | --- | --- |
| `/api/debug/all-autobids` | GET | 404 by default | Explicit auction and participant field allowlists |
| `/api/debug/autobid-check` | GET | 404 by default | Explicit participant, auction and summary DTO |
| `/api/debug/budget-verification` | GET | 404 by default | Explicit allowlists for each diagnostic dataset |
| `/api/admin/tasks/process-auctions` | POST | Admin only | Aggregate counts only; GET returns 405 |
| `/api/admin/tasks/*-timers` | POST | Admin only | Aggregate counts only; GET returns 405 |

The obsolete player-specific `/api/debug/addai` endpoint was removed. Debug APIs may be
enabled in production only by setting the boolean feature flag `ENABLE_DEBUG_API=true`;
the flag is not a secret and does not replace the route-level admin guard. Successful
and failed authorized debug/task operations emit structured `[ADMIN_AUDIT]` events.

## Socket tests
1. POST to `/api/emit` without `x-emit-secret`: expect 401.
2. POST with the wrong secret: expect 401.
3. POST with the configured secret: expect 200 and a single event.
4. Try joining another user's private room: expect rejection.

## Performance checks
1. Capture p95 latency for auction-state before and after deploy.
2. Check Turso query latency and write volume for heartbeat updates.
3. Confirm scheduler does not overlap runs and expired timers are processed once.
4. Confirm manager rosters are populated and no `Manager data unavailable` errors occur.
