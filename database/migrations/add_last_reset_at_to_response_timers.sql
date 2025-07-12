-- Migration: Add last_reset_at field to user_auction_response_timers
-- This field tracks when the response timer was last reset to 1 hour
-- Used to prevent resetting timer on every page load

ALTER TABLE user_auction_response_timers 
ADD COLUMN last_reset_at INTEGER DEFAULT NULL;

-- Update existing records to have last_reset_at = notified_at
UPDATE user_auction_response_timers 
SET last_reset_at = notified_at 
WHERE last_reset_at IS NULL;