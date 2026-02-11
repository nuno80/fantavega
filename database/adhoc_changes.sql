-- Reset di tutti i timer delle aste attive per le leghe 8 e 9 a 24 ore esatte da adesso
UPDATE auctions
SET scheduled_end_time = CAST(strftime('%s', 'now') AS INTEGER) + 86400
WHERE auction_league_id IN (8, 9) AND status = 'active';

-- Reset dei timer di risposta pendenti a 1 ora da adesso per evitare incoerenze con la nuova fine dell'asta
UPDATE user_auction_response_timers
SET response_deadline = CAST(strftime('%s', 'now') AS INTEGER) + 3600
WHERE status = 'pending'
  AND auction_id IN (SELECT id FROM auctions WHERE auction_league_id IN (8, 9) AND status = 'active');
