-- Prevents background jobs from running concurrently across app instances.
CREATE TABLE IF NOT EXISTS scheduler_leases (
  lease_name TEXT PRIMARY KEY,
  owner_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
