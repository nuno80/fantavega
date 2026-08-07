#!/usr/bin/env python3
"""Real SQLite contract tests for auction claim and settlement invariants."""
from pathlib import Path
import sqlite3
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = (ROOT / "database/schema.sql").read_text()


def connect(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path, timeout=5, isolation_level=None)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def seed(conn: sqlite3.Connection) -> int:
    conn.executescript(SCHEMA)
    conn.execute("INSERT INTO users(id,email,role) VALUES ('admin','admin@test','admin')")
    conn.execute("INSERT INTO users(id,email,role) VALUES ('winner','winner@test','manager')")
    conn.execute("INSERT INTO users(id,email,role) VALUES ('other','other@test','manager')")
    conn.execute("INSERT INTO auction_leagues(name,initial_budget_per_manager,admin_creator_id) VALUES ('Test',100,'admin')")
    league = conn.execute("SELECT id FROM auction_leagues").fetchone()[0]
    conn.execute("INSERT INTO players(id,role,name,team,current_quotation,initial_quotation) VALUES (1,'A','Player','Team',10,10)")
    conn.execute("INSERT INTO league_participants(league_id,user_id,current_budget,locked_credits) VALUES (?, 'winner', 100, 30)", (league,))
    conn.execute("INSERT INTO league_participants(league_id,user_id,current_budget,locked_credits) VALUES (?, 'other', 100, 20)", (league,))
    conn.execute("INSERT INTO auctions(auction_league_id,player_id,start_time,scheduled_end_time,current_highest_bid_amount,current_highest_bidder_id,status) VALUES (?,1,1,10,30,'winner','active')", (league,))
    auction = conn.execute("SELECT id FROM auctions").fetchone()[0]
    conn.execute("INSERT INTO auto_bids(auction_id,user_id,max_amount,is_active) VALUES (?, 'winner', 30, 1)", (auction,))
    conn.execute("INSERT INTO auto_bids(auction_id,user_id,max_amount,is_active) VALUES (?, 'other', 20, 1)", (auction,))
    return auction


def claim(conn: sqlite3.Connection, auction: int, now: int):
    return conn.execute("""
        UPDATE auctions SET status='closing', updated_at=?
        WHERE id=? AND status='active' AND scheduled_end_time<=?
          AND current_highest_bidder_id IS NOT NULL AND current_highest_bid_amount>0
        RETURNING id, auction_league_id, player_id, current_highest_bidder_id, current_highest_bid_amount
    """, (now, auction, now)).fetchone()


def settle(conn: sqlite3.Connection, row, now: int):
    auction, league, player, winner, amount = row
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute("UPDATE auto_bids SET is_active=0, updated_at=? WHERE auction_id=?", (now, auction))
        conn.execute("UPDATE league_participants SET current_budget=current_budget-?, locked_credits=0, updated_at=? WHERE league_id=? AND user_id=?", (amount, now, league, winner))
        balance = conn.execute("SELECT current_budget FROM league_participants WHERE league_id=? AND user_id=?", (league, winner)).fetchone()[0]
        conn.execute("UPDATE auctions SET status='sold', updated_at=? WHERE id=? AND status='closing'", (now, auction))
        conn.execute("INSERT INTO budget_transactions(auction_league_id,user_id,transaction_type,amount,balance_after_in_league,related_auction_id) VALUES (?,?,'win_auction_debit',?,?,?)", (league, winner, -amount, balance, auction))
        conn.execute("INSERT INTO player_assignments(auction_league_id,player_id,user_id,purchase_price,assigned_at) VALUES (?,?,?,?,?)", (league, player, winner, amount, now))
        conn.commit()
    except Exception:
        conn.rollback()
        raise


with tempfile.NamedTemporaryFile(suffix=".sqlite") as tmp:
    first = connect(tmp.name)
    auction = seed(first)
    second = connect(tmp.name)
    claimed = claim(first, auction, 20)
    assert claimed is not None, "first worker must claim the expired auction"
    assert claim(second, auction, 20) is None, "second worker must not claim it"
    settle(first, claimed, 20)
    assert first.execute("SELECT status FROM auctions WHERE id=?", (auction,)).fetchone()[0] == "sold"
    assert first.execute("SELECT current_budget FROM league_participants WHERE user_id='winner'").fetchone()[0] == 70
    assert first.execute("SELECT COUNT(*) FROM player_assignments WHERE auction_league_id=1 AND player_id=1").fetchone()[0] == 1
    assert first.execute("SELECT COUNT(*) FROM budget_transactions WHERE related_auction_id=?", (auction,)).fetchone()[0] == 1
    assert claim(second, auction, 20) is None, "retry after settlement must be a no-op"
    assert first.execute("SELECT current_budget FROM league_participants WHERE user_id='winner'").fetchone()[0] == 70
    first.close()
    second.close()

print("real SQLite settlement invariants: PASS")
