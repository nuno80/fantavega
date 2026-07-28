-- Migration: add last_reset_at to the current response-timer schema.
-- The canonical table uses created_at and activated_at timestamps.
ALTER TABLE user_auction_response_timers
ADD COLUMN last_reset_at INTEGER DEFAULT NULL;

UPDATE user_auction_response_timers
SET last_reset_at = COALESCE(activated_at, created_at)
WHERE last_reset_at IS NULL;
