-- Add 'auction_abandoned' to the transaction_type CHECK constraint
-- This allows users to abandon auctions and have the transaction logged

-- Drop the existing constraint
ALTER TABLE budget_transactions DROP CONSTRAINT IF EXISTS check_transaction_type;

-- Recreate the constraint with the new value
ALTER TABLE budget_transactions ADD CONSTRAINT check_transaction_type CHECK (
    transaction_type IN (
        'initial_allocation',
        'win_auction_debit',
        'penalty_requirement',
        'discard_player_credit',
        'admin_budget_increase',
        'admin_budget_decrease',
        'penalty_response_timeout',
        'timer_expired',
        'auction_abandoned'  -- ADDED: For when users voluntarily abandon auctions
    )
);
