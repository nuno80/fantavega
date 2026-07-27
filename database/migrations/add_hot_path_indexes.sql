CREATE INDEX IF NOT EXISTS idx_user_sessions_user_open
  ON user_sessions(user_id, session_end);
CREATE INDEX IF NOT EXISTS idx_user_sessions_heartbeat
  ON user_sessions(session_end, last_heartbeat);
CREATE INDEX IF NOT EXISTS idx_response_timers_user_status
  ON user_auction_response_timers(user_id, status, response_deadline);
CREATE INDEX IF NOT EXISTS idx_response_timers_status_deadline
  ON user_auction_response_timers(status, response_deadline);
CREATE INDEX IF NOT EXISTS idx_bids_auction_user
  ON bids(auction_id, user_id);
CREATE INDEX IF NOT EXISTS idx_auto_bids_auction_user_active
  ON auto_bids(auction_id, user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_assignments_league
  ON player_assignments(auction_league_id, user_id);
CREATE INDEX IF NOT EXISTS idx_participants_league_user
  ON league_participants(league_id, user_id);
