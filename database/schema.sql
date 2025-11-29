-- database/schema.sql v.1.3
-- Schema completo del database con ottimizzazioni degli indici, tabella per compliance penalità,
-- preferenze utente per giocatori e aggiornamenti timer di risposta.

-- Tabella Utenti (estende informazioni da Clerk)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, -- Corrisponde al Clerk userId
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    role TEXT NOT NULL DEFAULT 'manager' CHECK(role IN ('admin', 'manager')),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('pending_approval', 'active', 'suspended')),
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

INSERT OR IGNORE INTO users (id, email, role) VALUES ('user_2vJ5o9wgDIZM6wtwEx8XW36PrOe', 'nuno.80.al@gmail.com', 'admin');

-- Tabella Giocatori (dal file Excel e dati applicativi)
CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY,
    role TEXT NOT NULL CHECK(role IN ('P', 'D', 'C', 'A')),
    role_mantra TEXT,
    name TEXT NOT NULL,
    team TEXT NOT NULL,
    current_quotation INTEGER NOT NULL,
    initial_quotation INTEGER NOT NULL,
    current_quotation_mantra INTEGER,
    initial_quotation_mantra INTEGER,
    fvm INTEGER,
    fvm_mantra INTEGER,
    photo_url TEXT,
    is_starter BOOLEAN DEFAULT 0,       -- Titolare (icona shield)
    is_favorite BOOLEAN DEFAULT 0,      -- Preferito (icona sports_soccer)
    integrity_value INTEGER DEFAULT 0,  -- Integrità (icona trending_up) - valore numerico per possibili livelli
    has_fmv BOOLEAN DEFAULT 0,          -- FMV (icona timer)
    last_updated_from_source INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_players_name ON players(name);
CREATE INDEX IF NOT EXISTS idx_players_team ON players(team);
CREATE INDEX IF NOT EXISTS idx_players_role ON players(role);

-- Tabella Leghe/Stagioni d'Asta
CREATE TABLE IF NOT EXISTS auction_leagues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    league_type TEXT NOT NULL DEFAULT 'classic' CHECK(league_type IN ('classic', 'mantra')),
    initial_budget_per_manager INTEGER NOT NULL,
    -- CORREZIONE: Aggiornato il CHECK constraint con la lista di stati semplificata
    status TEXT NOT NULL DEFAULT 'participants_joining' CHECK(status IN ('participants_joining', 'draft_active', 'repair_active', 'market_closed', 'completed')),
    active_auction_roles TEXT,
    draft_window_start INTEGER,
    draft_window_end INTEGER,
    repair_1_window_start INTEGER,
    repair_1_window_end INTEGER,
    admin_creator_id TEXT NOT NULL,
    slots_P INTEGER NOT NULL DEFAULT 3,
    slots_D INTEGER NOT NULL DEFAULT 8,
    slots_C INTEGER NOT NULL DEFAULT 8,
    slots_A INTEGER NOT NULL DEFAULT 6,
    max_players_per_team INTEGER GENERATED ALWAYS AS (slots_P + slots_D + slots_C + slots_A) STORED,
    min_bid INTEGER NOT NULL DEFAULT 1,
    timer_duration_minutes INTEGER NOT NULL DEFAULT 1440,
    config_json TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (admin_creator_id) REFERENCES users(id) ON DELETE CASCADE
);


-- Tabella Partecipanti Lega (Manager iscritti a una lega/stagione)
CREATE TABLE IF NOT EXISTS league_participants (
    league_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    current_budget INTEGER NOT NULL,
    locked_credits INTEGER NOT NULL DEFAULT 0,
    manager_team_name TEXT,
    players_P_acquired INTEGER NOT NULL DEFAULT 0,
    players_D_acquired INTEGER NOT NULL DEFAULT 0,
    players_C_acquired INTEGER NOT NULL DEFAULT 0,
    players_A_acquired INTEGER NOT NULL DEFAULT 0,
    total_players_acquired INTEGER GENERATED ALWAYS AS (players_P_acquired + players_D_acquired + players_C_acquired + players_A_acquired) STORED,
    joined_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    PRIMARY KEY (league_id, user_id),
    FOREIGN KEY (league_id) REFERENCES auction_leagues(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Tabella Aste (per un singolo giocatore all'interno di una auction_league)
CREATE TABLE IF NOT EXISTS auctions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auction_league_id INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    start_time INTEGER NOT NULL,
    scheduled_end_time INTEGER NOT NULL,
    current_highest_bid_amount INTEGER DEFAULT 0,
    current_highest_bidder_id TEXT,
    user_auction_states TEXT, -- JSON string to store user-specific states
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'closing', 'sold', 'not_sold', 'cancelled')),
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (auction_league_id) REFERENCES auction_leagues(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    FOREIGN KEY (current_highest_bidder_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_auctions_status ON auctions(status);
CREATE INDEX IF NOT EXISTS idx_auctions_league_player ON auctions(auction_league_id, player_id);
CREATE INDEX IF NOT EXISTS idx_auctions_status_scheduled_end ON auctions(status, scheduled_end_time);

-- Tabella Offerte (per un'asta)
CREATE TABLE IF NOT EXISTS bids (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auction_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    bid_time INTEGER DEFAULT (strftime('%s', 'now')),
    bid_type TEXT DEFAULT 'manual' CHECK(bid_type IN ('manual', 'auto', 'quick')),
    FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_bids_auction_time ON bids(auction_id, bid_time DESC);
CREATE INDEX IF NOT EXISTS idx_bids_user ON bids(user_id);

-- Tabella Auto-Offerte (Funzionalità futura)
CREATE TABLE IF NOT EXISTS auto_bids (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auction_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    max_amount INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(auction_id, user_id)
);

-- Tabella Assegnazioni Giocatori (Rosa dei giocatori per manager per lega)
CREATE TABLE IF NOT EXISTS player_assignments (
    auction_league_id INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    purchase_price INTEGER NOT NULL,
    assigned_at INTEGER DEFAULT (strftime('%s', 'now')),
    PRIMARY KEY (auction_league_id, player_id),
    FOREIGN KEY (auction_league_id) REFERENCES auction_leagues(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_player_assignments_user ON player_assignments(auction_league_id, user_id);

-- Tabella Richieste di Svincolo Giocatori (Funzionalità futura)
CREATE TABLE IF NOT EXISTS player_discard_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auction_league_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    player_id INTEGER NOT NULL,
    reason TEXT,
    requested_at INTEGER DEFAULT (strftime('%s', 'now')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    admin_resolver_id TEXT,
    resolved_at INTEGER,
    credit_refund_amount INTEGER,
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (auction_league_id) REFERENCES auction_leagues(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    FOREIGN KEY (admin_resolver_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Tabella Transazioni di Budget
CREATE TABLE IF NOT EXISTS budget_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auction_league_id INTEGER NOT NULL,
    league_id INTEGER, -- Aggiunto per compatibilità con response-timer.service.ts
    user_id TEXT NOT NULL,
    transaction_type TEXT NOT NULL CHECK(transaction_type IN (
        'initial_allocation',
        'win_auction_debit',
        'penalty_requirement', -- Aggiunto per le penalità
        'discard_player_credit', -- Futuro
        'admin_budget_increase', -- Futuro
        'admin_budget_decrease', -- Futuro
        'penalty_response_timeout', -- Futuro
        'timer_expired', -- Aggiunto per timer scaduti
        'auction_abandoned' -- Aggiunto per abbandono volontario
    )),
    amount INTEGER NOT NULL,
    related_auction_id INTEGER,
    related_player_id INTEGER,
    related_discard_request_id INTEGER,
    description TEXT,
    balance_after_in_league INTEGER NOT NULL,
    transaction_time INTEGER DEFAULT (strftime('%s', 'now')),
    created_at INTEGER DEFAULT (strftime('%s', 'now')), -- Aggiunto per compatibilità
    FOREIGN KEY (auction_league_id) REFERENCES auction_leagues(id) ON DELETE CASCADE,
    FOREIGN KEY (league_id) REFERENCES auction_leagues(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (related_auction_id) REFERENCES auctions(id) ON DELETE SET NULL,
    FOREIGN KEY (related_player_id) REFERENCES players(id) ON DELETE SET NULL,
    FOREIGN KEY (related_discard_request_id) REFERENCES player_discard_requests(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_budget_transactions_user_league ON budget_transactions(user_id, auction_league_id, transaction_time DESC);

-- Tabella per Cooldown Utente Dopo Abbandono Asta (Funzionalità futura)
CREATE TABLE IF NOT EXISTS user_auction_cooldowns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auction_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    abandoned_at INTEGER DEFAULT (strftime('%s', 'now')),
    cooldown_ends_at INTEGER NOT NULL,
    FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(auction_id, user_id)
);

-- Tabella per Timer di Risposta Utente (Sistema Timer Rilancio)
CREATE TABLE IF NOT EXISTS user_auction_response_timers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auction_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    response_deadline INTEGER, -- NULL = timer pendente, valore = timer attivo
    activated_at INTEGER, -- quando il timer è stato attivato (login utente)
    processed_at INTEGER, -- quando il timer è stato processato
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'cancelled', 'abandoned', 'expired')),
    FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(auction_id, user_id)
);

-- Tabella Preferenze Utente per Giocatori (per lega e cooldown)
CREATE TABLE IF NOT EXISTS user_player_preferences (
    user_id TEXT NOT NULL,
    player_id INTEGER NOT NULL,
    league_id INTEGER NOT NULL,
    is_starter BOOLEAN DEFAULT FALSE,
    is_favorite BOOLEAN DEFAULT FALSE,
    integrity_value INTEGER DEFAULT 0,
    has_fmv BOOLEAN DEFAULT FALSE,
    preference_type TEXT DEFAULT 'preference', -- 'preference', 'cooldown'
    expires_at INTEGER, -- timestamp di scadenza per cooldown (NULL = permanente)
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),

    PRIMARY KEY (user_id, player_id, league_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    FOREIGN KEY (league_id) REFERENCES auction_leagues(id) ON DELETE CASCADE
);

-- Indici per performance delle preferenze utente
CREATE INDEX IF NOT EXISTS idx_user_player_preferences_user_league
ON user_player_preferences(user_id, league_id);

CREATE INDEX IF NOT EXISTS idx_user_player_preferences_player_league
ON user_player_preferences(player_id, league_id);

-- NUOVA TABELLA: Per Tracciare lo Stato di Conformità dell'Utente ai Requisiti di Rosa per Lega/Fase
CREATE TABLE IF NOT EXISTS user_league_compliance_status (
    league_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    phase_identifier TEXT NOT NULL,
    compliance_timer_start_at INTEGER,
    last_penalty_applied_for_hour_ending_at INTEGER,
    penalties_applied_this_cycle INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    PRIMARY KEY (league_id, user_id, phase_identifier),
    FOREIGN KEY (league_id) REFERENCES auction_leagues(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Trigger per aggiornare updated_at
CREATE TRIGGER IF NOT EXISTS update_users_updated_at
AFTER UPDATE ON users
FOR EACH ROW
WHEN OLD.updated_at = NEW.updated_at OR NEW.updated_at IS NULL
BEGIN
    UPDATE users SET updated_at = strftime('%s', 'now') WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS update_players_updated_at
AFTER UPDATE ON players
FOR EACH ROW
WHEN OLD.updated_at = NEW.updated_at OR NEW.updated_at IS NULL
BEGIN
    UPDATE players SET updated_at = strftime('%s', 'now') WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS update_auction_leagues_updated_at
AFTER UPDATE ON auction_leagues
FOR EACH ROW
WHEN OLD.updated_at = NEW.updated_at OR NEW.updated_at IS NULL
BEGIN
    UPDATE auction_leagues SET updated_at = strftime('%s', 'now') WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS update_league_participants_updated_at
AFTER UPDATE ON league_participants
FOR EACH ROW
WHEN OLD.updated_at = NEW.updated_at OR NEW.updated_at IS NULL
BEGIN
    UPDATE league_participants SET updated_at = strftime('%s', 'now') WHERE league_id = OLD.league_id AND user_id = OLD.user_id;
END;

CREATE TRIGGER IF NOT EXISTS update_auctions_updated_at
AFTER UPDATE ON auctions
FOR EACH ROW
WHEN OLD.updated_at = NEW.updated_at OR NEW.updated_at IS NULL
BEGIN
    UPDATE auctions SET updated_at = strftime('%s', 'now') WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS update_auto_bids_updated_at
AFTER UPDATE ON auto_bids
FOR EACH ROW
WHEN OLD.updated_at = NEW.updated_at OR NEW.updated_at IS NULL
BEGIN
    UPDATE auto_bids SET updated_at = strftime('%s', 'now') WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS update_player_discard_requests_updated_at
AFTER UPDATE ON player_discard_requests
FOR EACH ROW
WHEN OLD.updated_at = NEW.updated_at OR NEW.updated_at IS NULL
BEGIN
    UPDATE player_discard_requests SET updated_at = strftime('%s', 'now') WHERE id = OLD.id;
END;

-- Tabella Sessioni Utente (per tracking login/logout preciso)
CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    session_start INTEGER NOT NULL, -- timestamp login
    session_end INTEGER, -- timestamp logout (NULL se ancora online)
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(user_id, session_end);

-- Constraint: solo una sessione attiva per utente
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_unique_active
ON user_sessions(user_id) WHERE session_end IS NULL;

-- NUOVO TRIGGER: per user_league_compliance_status
CREATE TRIGGER IF NOT EXISTS update_user_league_compliance_status_updated_at
AFTER UPDATE ON user_league_compliance_status
FOR EACH ROW
WHEN OLD.updated_at = NEW.updated_at OR NEW.updated_at IS NULL
BEGIN
    UPDATE user_league_compliance_status SET updated_at = strftime('%s', 'now')
    WHERE league_id = OLD.league_id AND user_id = OLD.user_id AND phase_identifier = OLD.phase_identifier;
END;

-- Tabella per tracciare le sessioni di login processate per il check di compliance
CREATE TABLE IF NOT EXISTS processed_login_sessions (
    session_id TEXT PRIMARY KEY, -- Clerk session ID
    user_id TEXT NOT NULL,
    processed_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
