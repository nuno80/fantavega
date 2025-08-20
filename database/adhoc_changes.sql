-- database/adhoc_changes.sql

-- ATTENZIONE: Le query in questo file vengono eseguite dallo script `pnpm run db:apply-changes`.
-- Questo file è pensato per modifiche ad-hoc allo schema o ai dati che NON sono
-- gestite dalla riesecuzione di `database/schema.sql` (come ALTER TABLE su tabelle esistenti).
--
-- DOPO AVER ESEGUITO LE QUERY CON SUCCESSO:
-- 1. Assicurati di AGGIORNARE `database/schema.sql` per riflettere la nuova struttura "finale" del database
--    se hai apportato modifiche strutturali (es. aggiunto una colonna con ALTER TABLE).
-- 2. SVUOTA o COMMENTA le query in questo file per evitare di rieseguirle accidentalmente.
--    Questo file non tiene traccia di ciò che è stato eseguito.
--
-- Esempio di query (DA CANCELLARE O COMMENTARE DOPO L'USO):
-- ALTER TABLE users ADD COLUMN last_login DATETIME;
-- UPDATE products SET price = price * 1.10 WHERE category = 'electronics';
-- DELETE FROM logs WHERE timestamp < '2023-01-01';

-- Incolla qui le tue query ad-hoc:

-- COMPLETATO: Aggiunta tabella user_player_preferences
-- CREATE TABLE IF NOT EXISTS user_player_preferences (
--     user_id TEXT NOT NULL,
--     player_id INTEGER NOT NULL,
--     league_id INTEGER NOT NULL,
--     is_starter BOOLEAN DEFAULT FALSE,
--     is_favorite BOOLEAN DEFAULT FALSE,
--     integrity_value INTEGER DEFAULT 0,
--     has_fmv BOOLEAN DEFAULT FALSE,
--     created_at INTEGER DEFAULT (strftime('%s', 'now')),
--     updated_at INTEGER DEFAULT (strftime('%s', 'now')),
--     
--     PRIMARY KEY (user_id, player_id, league_id),
--     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
--     FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
--     FOREIGN KEY (league_id) REFERENCES auction_leagues(id) ON DELETE CASCADE
-- );

-- COMPLETATO: Indici per performance
-- CREATE INDEX IF NOT EXISTS idx_user_player_preferences_user_league 
-- ON user_player_preferences(user_id, league_id);

-- CREATE INDEX IF NOT EXISTS idx_user_player_preferences_player_league 
-- ON user_player_preferences(player_id, league_id);

-- MODIFICHE APPLICATE IL 06/07/2025:
-- Aggiunte colonne per le icone dei giocatori
-- - is_starter (BOOLEAN)
-- - is_favorite (BOOLEAN)
-- - integrity_value (INTEGER)
-- - has_fmv (BOOLEAN)
-- Queste colonne sono ora presenti anche nello schema principale in database/schema.sql

-- COMPLETATO: Fix per budget_transactions (Gennaio 2025)
-- Aggiunte colonne league_id e created_at per compatibilità con response-timer.service.ts

-- COMPLETATO: Fix CHECK constraint per 'timer_expired' (Gennaio 2025)
-- Tabella budget_transactions ricreata con supporto completo per 'timer_expired'

-- COMPLETATO: FIX CREDITI BLOCCATI (Gennaio 2025)
-- Corregge i locked_credits per riflettere la somma dei max_amount degli auto_bids attivi
-- Problema: I crediti bloccati non riflettevano correttamente gli importi massimi degli auto-bid

-- Prima, vediamo lo stato attuale (query di verifica)
-- SELECT 
--     lp.user_id,
--     u.username,
--     lp.current_budget,
--     lp.locked_credits as current_locked_credits,
--     COALESCE(SUM(ab.max_amount), 0) as calculated_locked_credits,
--     (lp.locked_credits - COALESCE(SUM(ab.max_amount), 0)) as difference
-- FROM league_participants lp
-- LEFT JOIN users u ON lp.user_id = u.id
-- LEFT JOIN auctions a ON a.auction_league_id = lp.league_id AND a.status = 'active'
-- LEFT JOIN auto_bids ab ON ab.auction_id = a.id AND ab.user_id = lp.user_id AND ab.is_active = TRUE
-- GROUP BY lp.user_id, lp.league_id, u.username, lp.current_budget, lp.locked_credits
-- ORDER BY u.username;

-- QUERY ESEGUITA CON SUCCESSO - COMMENTATA PER EVITARE RIESECUZIONE
-- UPDATE league_participants 
-- SET locked_credits = (
--     SELECT COALESCE(SUM(ab.max_amount), 0)
--     FROM auctions a
--     LEFT JOIN auto_bids ab ON ab.auction_id = a.id AND ab.user_id = league_participants.user_id AND ab.is_active = TRUE
--     WHERE a.auction_league_id = league_participants.league_id 
--     AND a.status = 'active'
-- ),
-- updated_at = strftime('%s', 'now');

-- COMPLETATO: FIX AGGIUNTIVO per inconsistenze residue (Gennaio 2025)
-- Alcuni utenti potrebbero avere ancora crediti bloccati errati dopo la correzione automatica
-- Rieseguita la correzione per essere sicuri

-- QUERY ESEGUITA CON SUCCESSO - COMMENTATA PER EVITARE RIESECUZIONE
-- UPDATE league_participants 
-- SET locked_credits = (
--     SELECT COALESCE(SUM(ab.max_amount), 0)
--     FROM auctions a
--     LEFT JOIN auto_bids ab ON ab.auction_id = a.id AND ab.user_id = league_participants.user_id AND ab.is_active = TRUE
--     WHERE a.auction_league_id = league_participants.league_id 
--     AND a.status = 'active'
-- ),
-- updated_at = strftime('%s', 'now');
-- COMPLETATO: FIX AUTO-BID SU ASTE VENDUTE (Gennaio 2025)
-- Disattiva tutti gli auto-bid su aste che hanno status 'sold' e sblocca i crediti corrispondenti
-- Problema: Gli auto-bid rimanevano attivi anche dopo che le aste erano finite

-- QUERY ESEGUITA CON SUCCESSO - COMMENTATA PER EVITARE RIESECUZIONE
-- 1. Disattiva tutti gli auto-bid su aste vendute
-- UPDATE auto_bids 
-- SET is_active = FALSE, updated_at = strftime('%s', 'now')
-- WHERE auction_id IN (
--     SELECT id FROM auctions WHERE status = 'sold'
-- ) AND is_active = TRUE;

-- 2. Ricalcola i locked_credits per tutti gli utenti (solo aste attive)
-- UPDATE league_participants 
-- SET locked_credits = (
--     SELECT COALESCE(SUM(ab.max_amount), 0)
--     FROM auctions a
--     LEFT JOIN auto_bids ab ON ab.auction_id = a.id AND ab.user_id = league_participants.user_id AND ab.is_active = TRUE
--     WHERE a.auction_league_id = league_participants.league_id 
--     AND a.status = 'active'
-- ),
-- updated_at = strftime('%s', 'now');
