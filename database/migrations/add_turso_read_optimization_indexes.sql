-- PERF-002: indexes for scheduler, locked-credit reconciliation and outbox hot paths.
CREATE INDEX IF NOT EXISTS idx_participants_locked_nonzero
  ON league_participants(league_id)
  WHERE locked_credits <> 0;

CREATE INDEX IF NOT EXISTS idx_auctions_league_status_bidder
  ON auctions(auction_league_id, status, current_highest_bidder_id);

CREATE INDEX IF NOT EXISTS idx_bids_auction_user_time
  ON bids(auction_id, user_id, bid_time DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_compliance_due
  ON user_league_compliance_status(compliance_timer_start_at, last_penalty_applied_for_hour_ending_at, penalties_applied_this_cycle, league_id)
  WHERE compliance_timer_start_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_outbox_claimable
  ON event_outbox(status, next_attempt_at, claimed_at, id);
