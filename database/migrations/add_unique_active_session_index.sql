-- Migration: enforce a single open session per user.
-- Apply once. NOT idempotent (closes duplicate open sessions), tracked via schema_migrations.
-- Keep the newest open session per user (by heartbeat/start), close the rest as history.
UPDATE user_sessions
SET session_end = COALESCE(last_heartbeat, session_start)
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY user_id
             ORDER BY COALESCE(last_heartbeat, session_start) DESC, id DESC
           ) AS rn
    FROM user_sessions
    WHERE session_end IS NULL
  ) ranked
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_unique_active
  ON user_sessions(user_id) WHERE session_end IS NULL;
