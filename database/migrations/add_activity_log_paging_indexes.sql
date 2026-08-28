-- PERF-001: paginate the activity log in the database.
-- Deterministic per-source ordering (DESC) with `id` as tie-breaker, so the
-- paginated merge is stable for events sharing the same timestamp.
-- bids: time-first so the planner can stream recent bids without a sort;
-- timers: expression index matching the route's event timestamp fallback.
CREATE INDEX IF NOT EXISTS idx_bids_time ON bids(bid_time DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_bids_user_time ON bids(user_id, bid_time DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_budget_tx_league_time ON budget_transactions(auction_league_id, transaction_time DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_start ON user_sessions(session_start DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_end ON user_sessions(session_end DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_response_timers_event_time ON user_auction_response_timers(COALESCE(processed_at, activated_at, created_at) DESC, id DESC);
