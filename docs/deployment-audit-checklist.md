# Deployment audit checklist

## Vercel

Run the config check with the Vercel environment loaded:

```bash
node scripts/verify-deployment-config.mjs vercel
```

Required names: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `NEXT_PUBLIC_SOCKET_URL`, `SOCKET_EMIT_SECRET`, `ALLOWED_ORIGINS`, `CLERK_SECRET_KEY`, and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.

Then verify a production build with `pnpm build`, run `pnpm test:run`, and confirm the deployment URL returns 401 for an unauthenticated API request.

## Railway Socket service

Run:

```bash
node scripts/verify-deployment-config.mjs railway
```

Required names: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SOCKET_EMIT_SECRET`, `ALLOWED_ORIGINS`, `CLERK_SECRET_KEY`, and `CLERK_PUBLISHABLE_KEY`.

Check that `/api/emit` returns 401 without the secret, that an authenticated Socket.IO handshake succeeds, and that a user cannot join another user's room or a league they cannot access.

## Database

Apply the versioned migrations, then verify the `last_heartbeat` column and timer/session indexes exist. Never run the full schema as a destructive reset against production.

## Release gate

The GitHub workflow checks manifests, required source files, the hardcoded admin seed, the malformed SQL comment, and the E2E test directory. Secret values are intentionally checked in the hosting dashboards, never committed.
