-- Apply once in production. Safe for existing databases.
ALTER TABLE user_sessions ADD COLUMN last_heartbeat INTEGER;
UPDATE user_sessions
SET last_heartbeat = COALESCE(last_heartbeat, session_start)
WHERE last_heartbeat IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_open
  ON user_sessions(user_id, session_end);
CREATE INDEX IF NOT EXISTS idx_user_sessions_heartbeat
  ON user_sessions(session_end, last_heartbeat);
