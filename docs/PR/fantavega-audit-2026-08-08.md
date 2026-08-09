# Fantavega: Security, Performance and Ghost-Session Audit

**Audit date:** 8 August 2026
**Reviewed revision:** `f6c04f0eecacaf1527562caab4c223b3181f648e`
**Implemented in commit:** `31829a7` ("fix(audit): apply 2026-08-08 audit fixes — timer liveness, authz boundaries, cooldown batching")
**Repository:** <https://github.com/nuno80/fantavega>

## Executive summary

The heartbeat and deferred-activation design is directionally correct, and PR #49 fixed important multi-tab and stale-callback races. The current revision still has one functional regression: the two auction-state routes persist a heartbeat but do not call `activateTimersForUser`, so a pending response timer may never start. Socket liveness is also coupled to HTTP polling, which can mark a connected user offline after 120 seconds.

No direct SQL injection was confirmed in the reviewed hot paths; database inputs are generally parameterized. The material security findings are authorization-boundary problems, not string escaping. The strongest performance finding is an N+1 cooldown lookup on the players endpoint.

## Severity table

| Severity | Finding | Consequence | Patch | Status |
| --- | --- | --- | --- | --- |
| High | Deferred timers are not activated by auction-state reads | Response window can remain pending indefinitely | PR 1 | Fixed (Fix 1) |
| High | User auction-state endpoint lacks league authorization | Authenticated cross-league data access | PR 2 | Fixed (Fix 2) |
| High | Participant can invoke a globally scoped expiry processor | Cross-league side effects and avoidable load | PR 2 | Fixed (Fix 2, league-scoped) |
| Medium | Socket connection does not maintain DB heartbeat | False offline state during polling failure | PR 1 | Not applied (product decision, see Fix 1) |
| Medium | Manager can mutate global player attributes | Unauthorized global data modification | PR 2 | Fixed (Fix 2, per-user) |
| Medium | One cooldown query per returned player | Hundreds of DB round trips per request | PR 3 | Fixed (Fix 3) |
| Medium | Scheduler lease expires after 45 seconds without renewal | Duplicate workers if a run is slow | Follow-up | Open (see Open follow-ups) |
| Medium | In-memory rate limiting is instance-local | Limits are bypassable across replicas | Follow-up | Open (see Open follow-ups) |
| Low | Debug APIs rely heavily on middleware | Future matcher changes could expose diagnostics | Follow-up | Open (see Open follow-ups) |

Note: "PR 1 / PR 2 / PR 3" in this table map to the patch files
`0001-fix-deferred-timer-liveness.patch`,
`0002-fix-api-authorization-boundaries.patch`,
`0003-perf-batch-player-cooldowns.patch`. "Fix 1 / Fix 2 / Fix 3" refer to the
sections in Implementation status below, which describe the final applied
changes (including deviations from the original patches).

## Ghost sessions and heartbeat analysis

### What is robust

The implementation tracks all sockets per user, delays logout by ten seconds, cancels pending logout after reconnect, and closes a session conditionally using `last_heartbeat <= disconnectedAt`. The unique partial index and retry logic reduce duplicate active sessions. Timer activation and expiry use conditional updates, preventing most duplicate side effects under concurrent polling and scheduler runs.

### Remaining edge cases

1. Both auction-state routes update liveness but omit deferred timer activation.
2. A healthy WebSocket with failed or suspended HTTP polling receives no DB heartbeat and becomes stale after 120 seconds.
3. In a multi-instance Socket.IO deployment, socket maps are process-local. A periodic shared DB heartbeat is needed so one instance cannot close a session still alive on another.
4. `updateHeartbeat` currently returns a timestamp after a failed retry; callers must never use an unpersisted timestamp to start a business timer.
5. A 120-second threshold intentionally treats longer network partitions as offline. This is a policy tradeoff, not a fully solvable browser-presence signal.

### Recommended state invariant

A response timer may be activated only after an authenticated request or socket heartbeat has been persisted. Activation must be a conditional database claim (`status='pending' AND response_deadline IS NULL`). Logout and reaping must never close a row with a heartbeat newer than the disconnect or cutoff.

## Security findings

### Missing league authorization

`src/app/api/user/auction-states/route.ts` accepts `leagueId` and returns league-specific auction data without verifying membership or admin access. Add numeric validation and `hasLeagueAccess` before heartbeat or database reads.

### Global processor exposed to participants

`src/app/api/leagues/[league-id]/process-expired-auctions/route.ts` checks membership in one league but invokes a service that processes all leagues. Restrict it to administrators until the service accepts and enforces a league scope.

### Global player mutation by managers

`src/app/api/players/[playerId]/toggle-icon/route.ts` accepts `leagueId` but writes global player columns. Until those values live in a user+league preference table, only administrators should mutate them. The missing `await` on `updatePlayer` also makes the not-found check ineffective.

## Performance findings

`src/app/api/players/route.ts` calls `getUserCooldownInfo` once per player. A page of 100 players causes approximately 101 database calls. PR 3 replaces this with one bulk query and caps page size at 1000 (see Fix 3 for why 1000 instead of the originally suggested 100), reducing database round trips to a constant number.

The scheduler lease lasts 45 seconds and is not renewed. Add owner-token renewal every 15 seconds or enforce a hard job timeout below the lease duration. The in-memory rate limiter and Socket.IO emission deduplication are not shared across replicas and should move to a shared store before horizontal scaling.

## Open follow-ups (not yet addressed)

These findings from the audit remain OPEN — no code was changed for them:

1. **Scheduler lease renewal.** The lease lasts 45 seconds and is not
   renewed. If a job run is slow, a second worker can acquire a duplicate
   lease. Options: renew the owner token every 15 seconds, or enforce a
   hard job timeout below the lease duration.
2. **Shared rate limiting / Socket.IO dedup.** The in-memory rate limiter
   and the Socket.IO emission deduplication are instance-local and are
   bypassable across replicas. They should move to a shared store before
   horizontal scaling.
3. **Debug APIs rely on middleware.** Debug endpoints depend heavily on
   middleware matcher config; a future matcher change could expose them.
   Worth an explicit check, not urgent.
4. **"Timer starts immediately when online" (product request).** Planned
   as a follow-up: when a user is surpassed while viewing the auction
   page, the server should notify the page via socket and the page should
   call `activateResponseTimerForViewedAuction` (response-timer-view.service.ts)
   so the countdown starts in real time without a refresh. This keeps the
   invariant "the timer starts only when the user has actually seen the
   raise". It is deliberately NOT in the current fix because it touches
   the client (auction page UI) and must not be mixed into the
   server-only change.

## Implementation status (updated after review)

All three fixes were reviewed line-by-line against the real source and the
product owner's decisions, then implemented and validated. Validation:
`pnpm type-check` clean, `pnpm build` passes, `pnpm test:run` 70/73 pass.
The 3 failing tests (`no-legacy-timer-activation`, `scheduler-lease`) are
pre-existing baseline failures (environment issues: `execFileSync` /
`randomUUID` unavailable under vitest) — confirmed identical on `main` via
`git stash`. Not introduced by these changes.

### Fix 1 — Deferred timer activation (applied, scoped)

**Applied:**

- `user/auction-states` and `leagues/[league-id]/auction-state` now call
  `activateTimersForUser(user.id, heartbeatAt)` after a successfully
  persisted heartbeat, so a pending response timer starts when the user
  opens an auction page.
- `updateHeartbeat` now throws on a failed retry instead of warning, so
  callers never start a business timer from an unpersisted timestamp.

**Not applied (by product decision) and why:**

- **No socket heartbeat (45s interval).** The audit suggested a periodic
  DB heartbeat from the socket server so a connected user is not marked
  offline when HTTP polling fails. The product owner rejected it: if the
  user is actively watching an auction, the socket connection is live and
  a missed poll is negligible against a 1-hour response window; if they
  are not watching, keeping the session alive only delays the 120s
  staleness reaping without any benefit. The 120s HTTP staleness
  threshold stays as-is.
- **No "activate immediately when online" inside `createResponseTimer`.**
  Planned as a separate step. The correct mechanism already exists:
  `activateResponseTimerForViewedAuction` (response-timer-view.service.ts)
  activates a timer only after the client confirms the auction is visible
  ("Presence/heartbeat must not call this"). When a user is surpassed
  while viewing the auction page, the server should notify the page via
  socket and the page should call that endpoint — this keeps the
  invariant "the timer starts only when the user has actually seen the
  raise" (1 hour starts from the moment of seeing, not before). This is
  tracked as a follow-up because it touches the client (auction page UI)
  and must not be mixed into the server-only fix.

### Fix 2 — Authorization boundaries (applied, reworked)

**Applied:**

- `user/auction-states` now validates `leagueId` numerically and enforces
  `hasLeagueAccess` before heartbeat/read. Comment added explaining that
  this endpoint is the user's *own* auction states and that watching
  other people's auctions "for fun" is intentionally supported on
  `leagues/[league-id]/auction-state` (which also enforces
  `hasLeagueAccess`). This closes a real data leak: any authenticated
  user could pass an arbitrary `leagueId` and read other leagues'
  auctions and bids, and their timers would activate against another
  league's auctions.
- `toggle-icon` reworked: it now writes **per-user/per-league
  preferences** (`user_player_preferences`) instead of global `players`
  columns, keeps the participant check, and the missing `await` on
  `updatePlayer` is gone (the old not-found check was a no-op). This is a
  product decision: the toggles are personal search filters (is_starter,
  is_favorite, integrity_value, has_fmv), so every user saves their own
  and only sees their own — not admin-only global mutations.
- `process-expired-auctions` now passes `leagueId` to
  `processExpiredAuctionsAndAssignPlayers(leagueId?)`, scoping the
  processing to the league in the URL, and keeps the participant check.
  The scheduler and the admin task endpoint remain global (no filter).
  This resolves the "participant triggers global expiry processor"
  finding without making the endpoint admin-only: participants may only
  process their own league.

**Not applied (by product decision) and why:**

- **Admin-only on `toggle-icon` and `process-expired-auctions`** (as the
  original patch proposed) was rejected. The toggles are personal filters,
  not global attributes; and the expiry endpoint is now league-scoped, so
  restricting it to admins would break the automatic 30s polling that
  `PlayerSearchInterface` performs for all users.
- The `limit` cap in Fix 3 was raised to 1000 (not 100) because
  `CallPlayerInterface` calls `/api/players?limit=1000`; a cap of 100
  would be a breaking client change.

### Fix 3 — Batch cooldown lookup (applied)

- New `getUserActiveCooldowns(userId, leagueId?)` loads all active
  cooldowns for a user in one round trip, replacing the N+1
  `getUserCooldownInfo` loop in `/api/players`.
- League scoping follows the product rule "every league lives its own
  life": cooldowns are league-scoped, so when `leagueId` is known the
  query filters by league (a user can have the same player in cooldown in
  two different leagues simultaneously).
- `limit` is capped at 1000 to bound per-request work without breaking
  the existing client.

### Tests

- `tests/e2e/ghost-session-api.e2e.test.ts` updated: mocks
  `activateTimersForUser` and `hasLeagueAccess`; the "updates presence"
  test now asserts the timer is activated only with the persisted
  heartbeat timestamp, and that the route itself never writes a response
  deadline.

> **Updated 2026-08-09 (re-audit)**: Fix 1's server-side activation was
> reverted by `fix(audit): apply 2026-08-09 re-audit fixes`. The 2026-08-09
> re-audit found that calling `activateTimersForUser` from the polling
> routes reintroduced the legacy behavior PR #38 removed: any poll (or
> reconnect, or viewing another league) started every pending timer for the
> user, contradicting the viewed-only invariant. Timers are now activated
> exclusively by the scoped `response-timer/viewed` endpoint after the
> client confirms the raise is visible; the polling routes only persist the
> heartbeat. See `docs/PR2/fantavega-reaudit-2026-08-09.md`.

## Patch application

Create one branch per patch from the reviewed revision:

```bash
git checkout main
git pull --ff-only
git checkout -b fix/deferred-timer-liveness
git apply --check 0001-fix-deferred-timer-liveness.patch
git apply 0001-fix-deferred-timer-liveness.patch

# Repeat from main for patches 0002 and 0003.
```

Validation for each branch:

```bash
pnpm install --frozen-lockfile
pnpm type-check
pnpm test:run
pnpm test:e2e
pnpm build
```

The production build on the reviewed `main` revision is already failing. Diagnose that baseline failure before attributing a build failure to these patches.

## Pull request split

1. `fix(auction): make deferred timer activation liveness-safe`
2. `fix(authz): enforce league and admin boundaries`
3. `perf(players): batch cooldown lookup`

Do not combine them. Each has a separate risk profile, rollback path and acceptance test.
