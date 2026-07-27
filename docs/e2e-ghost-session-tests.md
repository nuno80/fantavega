# End-to-end tests: ghost sessions and timers

Run locally with:

```bash
pnpm test:e2e
```

The suite covers the real Next route handlers with Clerk, DB, session, and timer boundaries mocked at the integration boundary. It verifies authentication, missing league parameters, heartbeat refresh, pending timer state, timer activation on return, inactivity logout, and stale-heartbeat invariants.

For a production smoke test, use two browser profiles:

1. User A opens an active auction and is outbid.
2. Hard-close A's tab without logout.
3. Confirm no `response_deadline` is created while A is away.
4. Wait at least 121 seconds, reopen the auction, and confirm a fresh heartbeat and timer activation.
5. Close one of two A tabs and confirm the other tab keeps the session alive.
6. Call `/api/user/set-inactive` while signed out and confirm HTTP 401.
