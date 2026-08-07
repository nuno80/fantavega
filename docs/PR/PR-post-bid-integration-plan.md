# Post-bid side effects: integration boundary

## Files to modify

- `src/lib/db/services/bid.service.ts`: replace the current fire-and-forget timer/state IIFE and `handleBidderChange` loop with the coordinator from PR #41.
- `src/lib/db/services/post-bid-side-effects.service.ts`: keep the coordinator as the only owner of timer/state sequencing.
- `tests/e2e/post-bid-side-effects.e2e.test.ts`: extend with the real auction-id lookup and failure matrix.

## Safe scope

Await only timer cancellation, bidder-state persistence, and response-timer creation through `Promise.allSettled`. Keep compliance checks, Socket.IO notifications, and user-facing non-critical notifications non-blocking.

## Risk

Medium-low. The bid transaction is already committed before this block. The main behavioral change is that the server waits for timer/state completion before returning the bid result.

## Failure behavior

A failed side effect must be logged with auction and user identifiers, but must not roll back or invalidate the committed bid. The next scheduler cycle or a reconciliation job must be able to repair the timer/state.

## Do not include

Do not change auto-bid calculation, budget validation, settlement, or auction status transitions in this PR.
