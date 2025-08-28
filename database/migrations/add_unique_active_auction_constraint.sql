-- Migration: Add unique constraint to prevent duplicate active auctions for the same player
-- This ensures only one active auction can exist per player per league

-- Drop the existing index first
DROP INDEX IF EXISTS idx_auctions_league_player;

-- Create a unique partial index that only applies to active auctions
-- This prevents duplicate active auctions for the same player while allowing historical records
CREATE UNIQUE INDEX idx_auctions_league_player_active 
ON auctions(auction_league_id, player_id) 
WHERE status IN ('active', 'closing');

-- Recreate the general index for non-active auctions for query performance
CREATE INDEX idx_auctions_league_player_general 
ON auctions(auction_league_id, player_id);