-- Migrazione: Aggiunta tabella user_player_preferences
-- Gestisce le preferenze personali degli utenti sui giocatori per ogni lega

CREATE TABLE IF NOT EXISTS user_player_preferences (
    user_id TEXT NOT NULL,
    player_id INTEGER NOT NULL,
    league_id INTEGER NOT NULL,
    is_starter BOOLEAN DEFAULT FALSE,
    is_favorite BOOLEAN DEFAULT FALSE,
    integrity_value INTEGER DEFAULT 0,
    has_fmv BOOLEAN DEFAULT FALSE,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    
    PRIMARY KEY (user_id, player_id, league_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    FOREIGN KEY (league_id) REFERENCES auction_leagues(id) ON DELETE CASCADE
);

-- Indici per performance
CREATE INDEX IF NOT EXISTS idx_user_player_preferences_user_league 
ON user_player_preferences(user_id, league_id);

CREATE INDEX IF NOT EXISTS idx_user_player_preferences_player_league 
ON user_player_preferences(player_id, league_id);