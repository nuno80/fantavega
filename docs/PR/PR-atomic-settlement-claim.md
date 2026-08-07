# Atomic auction settlement claim

This PR introduces the database primitive needed before wiring settlement retries to an atomic claim.

The claim changes an eligible auction from `active` to `closing` with a conditional update and `RETURNING`. A worker proceeds only when it receives a row. A second worker receives no row and must not settle the auction.

The primitive is intentionally isolated from the existing settlement implementation. Wiring it directly into `bid.service.ts` is a separate integration step because the current settlement code treats `closing` as an active auction in several read paths. That integration must be tested against a real SQLite/Turso-compatible database before merge.
