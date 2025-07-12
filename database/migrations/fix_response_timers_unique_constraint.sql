-- Migration: Fix UNIQUE constraint in user_auction_response_timers
-- Remove status from UNIQUE constraint to allow multiple actions per auction/user

-- Step 1: Create new table with correct constraint
CREATE TABLE user_auction_response_timers_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auction_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    notified_at INTEGER DEFAULT (strftime('%s', 'now')), 
    response_deadline INTEGER NOT NULL, 
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'action_taken', 'deadline_missed')),
    last_reset_at INTEGER DEFAULT NULL,
    FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(auction_id, user_id) -- Removed status from UNIQUE constraint
);

-- Step 2: Copy data from old table (only most recent record per auction_id/user_id)
INSERT INTO user_auction_response_timers_new 
SELECT id, auction_id, user_id, notified_at, response_deadline, status, last_reset_at
FROM user_auction_response_timers t1
WHERE t1.id = (
    SELECT MAX(t2.id) 
    FROM user_auction_response_timers t2 
    WHERE t2.auction_id = t1.auction_id AND t2.user_id = t1.user_id
);

-- Step 3: Drop old table
DROP TABLE user_auction_response_timers;

-- Step 4: Rename new table
ALTER TABLE user_auction_response_timers_new RENAME TO user_auction_response_timers;