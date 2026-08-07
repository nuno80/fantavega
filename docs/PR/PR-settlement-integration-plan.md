# Atomic settlement: integration plan

## Files to modify

- `src/lib/db/services/bid.service.ts`: claim each expired auction before calling settlement; process only a successful claim.
- `src/lib/db/services/auction-settlement-claim.service.ts`: add claim ownership/lease semantics if settlement can exceed the scheduler lease duration.
- `src/lib/db/services/locked-credits.service.ts`: use one authoritative rebuild after settlement and make affected-user handling explicit.
- `database/schema.sql`: keep status and indexes aligned with the claim contract.
- `tests/e2e/auction-settlement-claim.e2e.test.ts`: replace query mocks with a real SQLite fixture.
- `tests/e2e/settlement-real-db.test.ts`: cover rollback, retry, duplicate assignment, double debit, and locked-credit reconciliation.

## Required sequence

1. Claim `active -> closing` atomically.
2. Settle only the returned claim row.
3. Commit auction status, auto-bids, budget, budget transaction, credits, and assignment in one transaction.
4. Mark the auction `sold` only inside that transaction.
5. On failure, rollback and leave a recoverable `closing` record with an explicit retry policy.
6. On retry, use a conditional status transition and uniqueness checks to prevent a second debit or assignment.

## Risk

High if implemented in one large edit. Medium if split into claim integration, settlement idempotency, and real-database tests. The largest danger is the current code treating `closing` as active in bidding/read paths.

## Decision

Do not merge the integration until the real database tests pass. PR #42 alone is only a primitive and does not protect production until this worker integration exists.
