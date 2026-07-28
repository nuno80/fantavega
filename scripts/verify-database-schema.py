#!/usr/bin/env python3
import pathlib
import sqlite3

root = pathlib.Path(__file__).resolve().parents[1]
schema = (root / 'database/schema.sql').read_text()

conn = sqlite3.connect(':memory:')
conn.execute('PRAGMA foreign_keys = ON')
try:
    conn.executescript(schema)
except sqlite3.Error as exc:
    raise SystemExit(f'schema failed: {exc}')

required_tables = {
    'users', 'players', 'auction_leagues', 'league_participants', 'auctions',
    'bids', 'auto_bids', 'player_assignments', 'player_discard_requests',
    'budget_transactions', 'user_auction_cooldowns', 'user_auction_response_timers',
    'user_player_preferences', 'user_league_compliance_status', 'user_sessions',
    'processed_login_sessions',
}
actual = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
missing = required_tables - actual
if missing:
    raise SystemExit(f'missing tables: {sorted(missing)}')

# Seed parent rows before testing foreign-keyed compliance state.
conn.execute("INSERT INTO users(id,email,role) VALUES ('u','u@example.test','admin')")
conn.execute("INSERT INTO auction_leagues(name,initial_budget_per_manager,admin_creator_id) VALUES ('League',100,'u')")
league = conn.execute('SELECT id FROM auction_leagues').fetchone()[0]

# Verify the repaired trigger with the composite primary key.
conn.execute("INSERT INTO user_league_compliance_status(league_id,user_id,phase_identifier) VALUES (?,?,?)", (league, 'u', 'draft'))
conn.execute("UPDATE user_league_compliance_status SET updated_at=updated_at WHERE league_id=? AND user_id=? AND phase_identifier=?", (league, 'u', 'draft'))

# Verify representative foreign-key relationships and uniqueness constraints.
conn.execute("INSERT INTO players(id,role,name,team,current_quotation,initial_quotation) VALUES (1,'P','Player','Team',10,10)")
conn.execute("INSERT INTO league_participants(league_id,user_id,current_budget) VALUES (?,?,100)", (league, 'u'))
conn.execute("INSERT INTO auctions(auction_league_id,player_id,start_time,scheduled_end_time) VALUES (?,?,1,2)", (league, 1))
auction = conn.execute('SELECT id FROM auctions').fetchone()[0]
conn.execute("INSERT INTO user_auction_response_timers(auction_id,user_id) VALUES (?,?)", (auction, 'u'))

fk_errors = list(conn.execute('PRAGMA foreign_key_check'))
if fk_errors:
    raise SystemExit(f'foreign-key errors: {fk_errors}')

# Static guards for the two migrations that previously targeted an obsolete schema.
last_reset = (root / 'database/migrations/add_last_reset_at_to_response_timers.sql').read_text()
if 'notified_at' in last_reset:
    raise SystemExit('obsolete notified_at reference remains in add_last_reset migration')
unique_fix = (root / 'database/migrations/fix_response_timers_unique_constraint.sql').read_text()
if 'CREATE TABLE user_auction_response_timers_new' in unique_fix or 'notified_at' in unique_fix:
    raise SystemExit('obsolete timer table rebuild remains in unique-constraint migration')

print('database schema and migration audit: PASS')
