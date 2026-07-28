# PR: harden ghost-session logout and response-timer state machine

## Title

`fix(auction): make ghost-session logout and response timers race-safe with E2E coverage`

## Status found before this PR

The public `main` history currently shows PR #17 as the latest timer-related merge, while the public source still contains the pre-hardening patterns: Socket.IO calls `recordUserLogout(userId)` without a disconnect timestamp, timer activation updates by `id` only, expiry updates by `id` only, and the unused single-timer helper remains. Do not mark this PR complete until the merged commit visibly contains all changes below.

## Scope

This single PR combines:

1. Conditional forced logout using `disconnectedAt` and `notAfter`.
2. Atomic claims for activation, expiry, and manual abandonment.
3. Awaited heartbeat then activation in both auction-state endpoints.
4. E2E regression coverage for hard-close, reconnect, HTTP-only liveness, and concurrent processing.

## Runtime changes

### `src/lib/db/services/session.service.ts`

Change the logout signature to accept an optional cutoff:

```ts
export const recordUserLogout = async (
  userId: string,
  notAfter?: number
): Promise<void> => {
  const now = Math.floor(Date.now() / 1000);
  const result = await db.execute({
    sql: notAfter === undefined
      ? `UPDATE user_sessions
         SET session_end = ?
         WHERE user_id = ? AND session_end IS NULL`
      : `UPDATE user_sessions
         SET session_end = ?
         WHERE user_id = ?
           AND session_end IS NULL
           AND (last_heartbeat IS NULL OR last_heartbeat <= ?)` ,
    args: notAfter === undefined
      ? [now, userId]
      : [now, userId, notAfter],
  });
  if (result.rowsAffected > 0) {
    console.log(`[SESSION] Closed ${result.rowsAffected} session(s) for ${userId}`);
  }
};
```

### `socket-server.ts`

Capture the disconnect time and pass it to the delayed logout:

```ts
socket.on("disconnect", () => {
  const userId = socket.data.userId as string | undefined;
  const disconnectedAt = Math.floor(Date.now() / 1000);
  if (!userId || !recordUserLogout) return;

  setTimeout(async () => {
    if (!io.sockets.adapter.rooms.get(`user-${userId}`)?.size) {
      await recordUserLogout?.(userId, disconnectedAt);
    }
  }, 10_000);
});
```

This preserves the lazy-user policy. A later HTTP heartbeat wins; a stale callback cannot close a newer live session.

### `src/lib/db/services/response-timer.service.ts`

For activation, replace the unconditional update with a claim:

```ts
const activation = await db.execute({
  sql: `UPDATE user_auction_response_timers
        SET response_deadline = ?, activated_at = ?
        WHERE id = ?
          AND status = 'pending'
          AND response_deadline IS NULL`,
  args: [deadline, effectiveLoginTime, timer.id],
});
if (activation.rowsAffected === 0) continue;
await notifySocketServer(/* response-timer-started */);
```

For expiry, claim inside the write transaction before any cooldown, ledger, budget, or socket side effect:

```ts
const claim = await transaction.execute({
  sql: `UPDATE user_auction_response_timers
        SET status = 'expired', processed_at = ?
        WHERE id = ?
          AND status = 'pending'
          AND response_deadline IS NOT NULL
          AND response_deadline <= ?`,
  args: [now, timer.id, now],
});
if (claim.rowsAffected === 0) {
  await transaction.rollback();
  continue;
}
```

For manual abandonment, require `status = 'pending'`, check `rowsAffected`, and stop if another worker already claimed the timer. Remove the unreachable `activateTimerForUser()` helper.

### Auction-state routes

In both `src/app/api/user/auction-states/route.ts` and `src/app/api/leagues/[league-id]/auction-state/route.ts`, replace fire-and-forget behavior with:

```ts
try {
  const heartbeatAt = await updateHeartbeat(user.id);
  await activateTimersForUser(user.id, heartbeatAt);
} catch (error) {
  console.error("[AUCTION-STATE] Error refreshing session:", error);
}
```

Fetch the returned auction state only after this sequence completes.

## E2E test file

Create `tests/e2e/ghost-session-timer-hardening.test.ts` using the existing Vitest E2E seam and its Clerk/database mocks. Adapt imports and fixtures to the repository's existing helpers rather than introducing a new test framework.

Required test cases:

```ts
import { describe, expect, it } from "vitest";

describe("ghost session and response timer hardening", () => {
  it("keeps an outbid offline user's timer pending without a deadline", async () => {
    // Create pending timer, do not issue authenticated heartbeat/request.
    // Run scheduler/reaper within the stale window.
    // Assert status=pending and response_deadline=null.
  });

  it("activates exactly one 60-minute timer on the first authenticated return", async () => {
    // Call the auction-state route once after updateHeartbeat creates the session.
    // Assert one activated_at, deadline=heartbeatAt+3600, and one socket event.
  });

  it("does not let a delayed socket logout close a newer heartbeat", async () => {
    // Disconnect at t0, heartbeat at t0+2, invoke delayed logout with notAfter=t0.
    // Assert session_end remains null.
  });

  it("closes a lazy user when no heartbeat follows disconnect", async () => {
    // Disconnect at t0, invoke delayed logout with notAfter=t0 and no heartbeat.
    // Assert session_end is populated.
  });

  it("keeps the session alive when WebSocket is lost but HTTP polling continues", async () => {
    // Disconnect socket, send heartbeat after t0, invoke delayed logout.
    // Assert the heartbeat-protected session remains open.
  });

  it("claims activation once under concurrent polling", async () => {
    // Promise.all([GET(), GET()]) against one pending timer.
    // Assert one deadline and one response-timer-started event.
  });

  it("processes expiry once under concurrent scheduler runs", async () => {
    // Promise.all([runManualProcessing(), runManualProcessing()]).
    // Assert one expired timer, one cooldown, one timer_expired ledger row.
  });

  it("does not allow concurrent abandon and expiry to duplicate side effects", async () => {
    // Race abandonAuction against processExpiredResponseTimers.
    // Assert one terminal transition and one business outcome.
  });
});
```

## Validation

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm type-check
pnpm test:run
pnpm test:e2e
pnpm build
```

Manual browser smoke test: User1 outbids User2, hard-close User2 before the auction state is viewed, verify the timer remains pending with no deadline, wait for forced logout/reaper, reopen the auction, and verify one timer with approximately 3600 seconds remaining. Repeat with reconnect within 10 seconds and with WebSocket disconnected while HTTP polling continues.

## Risk and rollout

Low schema risk: no new table or column is required if `last_heartbeat` is already deployed. Verify the Turso migration and indexes first. Deploy the Socket.IO server and Next.js app from the same commit, then run the smoke test and inspect timer/session rows directly.

## Acceptance criteria

- A delayed disconnect cannot close a session whose heartbeat is newer than the disconnect.
- A lazy user without heartbeat is forced offline.
- A timer cannot receive two activation deadlines.
- Expiry cannot create duplicate cooldown, ledger, budget, or notification side effects.
- The first authenticated response includes the activated deadline.
- All automated checks and the manual hard-close/reconnect matrix pass.
