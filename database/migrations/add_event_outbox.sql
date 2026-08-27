-- REL-006: Durable event outbox. Essential realtime events are written in the
-- same transaction as the mutation that produced them, then delivered by a
-- dispatcher with retry/backoff/dead-letter. Non-essential events are
-- best-effort (fewer retries). Events are at-least-once; consumers must be
-- idempotent (client refetches on reconnect, socket dedup by shouldEmit).
CREATE TABLE IF NOT EXISTS event_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  room TEXT NOT NULL,
  event_name TEXT NOT NULL,
  payload TEXT NOT NULL,
  essential INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'dead')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  claimed_at INTEGER,
  owner_token TEXT
);
CREATE INDEX IF NOT EXISTS idx_outbox_dispatch ON event_outbox(status, next_attempt_at);
