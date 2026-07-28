-- database/schema.sql v.1.3
-- Schema completo del database con ottimizzazioni degli indici, tabella per compliance penalità,
-- preferenze utente per giocatori e aggiornamenti timer di risposta.

-- Tabella Utenti (estende informazioni da Clerk)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    role TEXT NOT NULL DEFAULT 'manager' CHECK(role IN ('admin', 'manager')),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('pending_approval', 'active', 'suspended')),
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Admin e utenti iniziali devono essere creati tramite seed/deployment sicuro,
-- mai tramite un'identità o un'email hardcoded nello schema.

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
    is_starter BOOLEAN DEFAULT 0,
    is_favorite BOOLEAN DEFAULT 0,
    integrity_value INTEGER DEFAULT 0,
    has_fmv BOOLEAN DEFAULT 0,
    last_updated_from_source INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_players_name ON players(name);
CREATE INDEX IF NOT EXISTS idx_players_team ON players(team);
CREATE INDEX IF NOT EXISTS idx_players_role ON players(role);
