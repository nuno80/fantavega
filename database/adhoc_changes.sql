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