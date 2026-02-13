-- RIPRISTINO MANUALE ASTA DUROSINMI LEGA 8
-- RIMOSSI BEGIN/COMMIT espliciti perché apply-changes.ts gestisce già la transazione.

-- 1. Crea la nuova asta
INSERT INTO auctions (auction_league_id, player_id, start_time, scheduled_end_time, current_highest_bid_amount, current_highest_bidder_id, status)
VALUES (
    8,
    7316,
    CAST(strftime('%s', 'now') AS INTEGER), -- Start Time: Adesso
    CAST(strftime('%s', 'now') AS INTEGER) + 86400, -- End Time: Tra 24h
    20,
    'user_36o60LV7cAU6XbfKEpArGATDRdr',
    'active'
);

-- 2. Inserisci l'offerta corrispondente usando l'ID appena generato
INSERT INTO bids (auction_id, user_id, amount, bid_time, bid_type)
VALUES (
    last_insert_rowid(), -- Recupera ID dell'asta appena inserita
    'user_36o60LV7cAU6XbfKEpArGATDRdr',
    20,
    CAST(strftime('%s', 'now') AS INTEGER),
    'manual'
);
