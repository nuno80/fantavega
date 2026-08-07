# Fantavega technical risk review

**Date:** 7 August 2026

## CI findings

- PR #46 quality failed with exit code 1 after adding production build and a legacy ESLint configuration path.
- PR #47 quality failed with exit code 1 after adding the real SQLite settlement gate.
- Vercel preview deployments were successful on both PRs.
- GitHub annotations expose warnings and the final exit code, but not the failing command output. The remaining failure must be confirmed by rerunning after isolating build and SQLite steps.

## Automated residual-risk review

### High risk

- Settlement claim exists but is not wired into `processExpiredAuctionsAndAssignPlayers`.
- `closing` is used by multiple read and bidding queries, so changing its semantics can block valid bids.
- Real SQLite test is a contract test, not a test of the production `bid.service.ts` settlement implementation.

### Medium risk

- Post-bid coordinator exists but is not wired into `bid.service.ts`.
- Scheduler lease prevents overlapping scheduler runs, but lease expiry during a long job still needs renewal or a duration guarantee.
- In-memory rate limiting is not safe across instances.
- Socket notifications remain non-persistent and can be lost after commit.

### Low risk

- TypeScript and database schema checks are present.
- Vercel preview deployment is green.
- Atomic claim primitive and SQLite invariants provide a useful foundation.

## Recommended next steps

1. Run the flat-config migration and restore lint as a gate.
2. Run CI with each step separately visible: type-check, lint, tests, schema, SQLite settlement, build.
3. Fix the first failing step before changing application code.
4. Wire post-bid side effects in a dedicated runtime PR.
5. Wire settlement claim only after production-code SQLite tests cover retry, rollback, duplicate assignment, and double debit.
6. Add scheduler lease renewal or enforce a job timeout below lease duration.
7. Replace the in-memory rate limiter with a shared store.

## What is still missing

- Full CI log output for the failing commands.
- A real test invoking production settlement code rather than a duplicate Python model.
- Idempotent production settlement on retries.
- Browser E2E execution with isolated authenticated data.
- Flat-config migration verification on the actual repository dependency lockfile.
