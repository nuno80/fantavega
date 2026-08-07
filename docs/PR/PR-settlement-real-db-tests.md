# Settlement: real database verification plan

## Why this is isolated

The current settlement code updates auction status, auto-bids, locked credits, budget, budget transactions, and player assignment inside one write transaction. Mocked tests cannot prove that the database preserves these invariants under retries and concurrent workers.

## Required scenarios

1. Two workers attempt to claim the same expired auction: exactly one receives the claim row.
2. A failed settlement rolls back status, budget, locked credits, budget transaction, and assignment together.
3. A retry after a completed settlement does not debit the winner twice.
4. A retry does not create a duplicate player assignment.
5. Auto-bids are disabled and locked credits are rebuilt consistently.
6. The claim and settlement work with the SQLite/Turso-compatible schema.

## Risk assessment

Low runtime risk because this PR adds no production behavior. It is a prerequisite for the integration PR: merging it alone does not change auction behavior.

## Next implementation step

Use the real database fixture in this PR to validate the worker integration from the atomic claim PR. Do not merge the worker integration until all scenarios pass.
