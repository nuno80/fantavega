-- Migrazione per aggiungere le colonne per le icone dei giocatori
-- Eseguire questo script per aggiornare il database esistente

-- Aggiungi colonna is_starter
ALTER TABLE players ADD COLUMN is_starter BOOLEAN DEFAULT 0;

-- Aggiungi colonna is_favorite
ALTER TABLE players ADD COLUMN is_favorite BOOLEAN DEFAULT 0;

-- Aggiungi colonna integrity_value
ALTER TABLE players ADD COLUMN integrity_value INTEGER DEFAULT 0;

-- Aggiungi colonna has_fmv
ALTER TABLE players ADD COLUMN has_fmv BOOLEAN DEFAULT 0;

-- Aggiorna la data di modifica di tutti i giocatori
UPDATE players SET updated_at = strftime('%s', 'now');

-- Verifica che le colonne siano state aggiunte correttamente
PRAGMA table_info(players);