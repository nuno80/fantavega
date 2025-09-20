import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { db } from '@/lib/db';
import { processExpiredResponseTimers } from '@/lib/db/services/response-timer.service';
import { notifySocketServer } from '@/lib/socket-emitter';

// Define types for our test data
interface Auction {
  id: number;
  auction_league_id: number;
  player_id: number;
  start_time: number;
  scheduled_end_time: number;
  current_highest_bid_amount: number;
  current_highest_bidder_id: string | null;
  status: string;
  updated_at?: number;
}

interface ResponseTimer {
  id: number;
  auction_id: number;
  user_id: string;
  created_at: number;
  response_deadline: number;
  status: string;
  processed_at?: number;
}

interface PlayerAssignment {
  auction_league_id: number;
  player_id: number;
  user_id: string;
  purchase_price: number;
  assigned_at: number;
}

interface LeagueParticipant {
  league_id: number;
  user_id: string;
  current_budget: number;
  locked_credits: number;
}

// Mock the socket emitter
vi.mock('@/lib/socket-emitter', () => ({
  notifySocketServer: vi.fn()
}));

describe('Response Timer Expiration', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    
    // Clean up any existing test data
    try {
      db.prepare('DELETE FROM user_auction_response_timers WHERE auction_id = 1').run();
      db.prepare('DELETE FROM auctions WHERE id = 1').run();
      db.prepare('DELETE FROM league_participants WHERE league_id = 1 AND user_id = ?').run('test-user-1');
      db.prepare('DELETE FROM players WHERE id = 1').run();
      db.prepare('DELETE FROM users WHERE id = ?').run('test-user-1');
      db.prepare('DELETE FROM auction_leagues WHERE id = 1').run();
    } catch (e) {
      // Ignore errors if tables are empty
    }
    
    // Insert test user first (needed for foreign key constraint)
    db.prepare(`
      INSERT INTO users (id, email, username, role)
      VALUES ('test-user-1', 'test1@example.com', 'testuser1', 'manager')
    `).run();
    
    // Insert test league
    db.prepare(`
      INSERT INTO auction_leagues (id, name, initial_budget_per_manager, status, slots_P, slots_D, slots_C, slots_A, admin_creator_id)
      VALUES (1, 'Test League', 1000, 'draft_active', 1, 2, 2, 1, 'test-user-1')
    `).run();
    
    // Insert test player
    db.prepare(`
      INSERT INTO players (id, role, name, team, current_quotation, initial_quotation)
      VALUES (1, 'P', 'Test Player', 'Test Team', 10, 5)
    `).run();
    
    // Insert league participant
    db.prepare(`
      INSERT INTO league_participants (league_id, user_id, current_budget, locked_credits)
      VALUES (1, 'test-user-1', 1000, 50)
    `).run();
    
    // Insert test auction
    db.prepare(`
      INSERT INTO auctions (id, auction_league_id, player_id, start_time, scheduled_end_time, current_highest_bid_amount, current_highest_bidder_id, status)
      VALUES (1, 1, 1, 1000, 2000, 50, 'test-user-1', 'active')
    `).run();
    
    // Insert response timer that has expired
    db.prepare(`
      INSERT INTO user_auction_response_timers (id, auction_id, user_id, created_at, response_deadline, status)
      VALUES (1, 1, 'test-user-1', 1500, 1600, 'pending')
    `).run();
  });

  afterEach(() => {
    // Clean up test data
    try {
      db.prepare('DELETE FROM user_auction_response_timers WHERE auction_id = 1').run();
      db.prepare('DELETE FROM auctions WHERE id = 1').run();
      db.prepare('DELETE FROM league_participants WHERE league_id = 1 AND user_id = ?').run('test-user-1');
      db.prepare('DELETE FROM players WHERE id = 1').run();
      db.prepare('DELETE FROM users WHERE id = ?').run('test-user-1');
      db.prepare('DELETE FROM auction_leagues WHERE id = 1').run();
    } catch (e) {
      // Ignore errors if tables are empty
    }
  });

  it('should properly process expired response timers and free up auction slots', async () => {
    // Verify initial state
    const initialAuction = db.prepare('SELECT * FROM auctions WHERE id = 1').get() as Auction;
    expect(initialAuction.status).toBe('active');
    
    const initialTimer = db.prepare('SELECT * FROM user_auction_response_timers WHERE id = 1').get() as ResponseTimer;
    expect(initialTimer.status).toBe('pending');
    
    // Process expired timers
    const result = processExpiredResponseTimers();
    
    // Verify the timer was processed
    expect(result.processedCount).toBe(1);
    expect(result.errors).toHaveLength(0);
    
    // Verify the timer status was updated
    const updatedTimer = db.prepare('SELECT * FROM user_auction_response_timers WHERE id = 1').get() as ResponseTimer;
    expect(updatedTimer.status).toBe('expired');
    expect(updatedTimer.processed_at).toBeDefined();
    
    // Verify the auction status was updated to 'sold'
    const updatedAuction = db.prepare('SELECT * FROM auctions WHERE id = 1').get() as Auction;
    expect(updatedAuction.status).toBe('sold');
    expect(updatedAuction.updated_at).toBeDefined();
    
    // Verify the player was assigned to the highest bidder
    const playerAssignment = db.prepare('SELECT * FROM player_assignments WHERE player_id = 1 AND user_id = ?').get('test-user-1') as PlayerAssignment | undefined;
    expect(playerAssignment).toBeDefined();
    expect(playerAssignment?.purchase_price).toBe(50);
    
    // Verify the user's budget was updated
    const participant = db.prepare('SELECT * FROM league_participants WHERE user_id = ? AND league_id = 1').get('test-user-1') as LeagueParticipant;
    expect(participant.current_budget).toBe(950); // 1000 - 50
    expect(participant.locked_credits).toBe(0); // 50 unlocked
  });

  it('should handle expired timers without a highest bidder', () => {
    // Update auction to have no highest bidder
    db.prepare('UPDATE auctions SET current_highest_bidder_id = NULL WHERE id = 1').run();
    
    // Process expired timers
    const result = processExpiredResponseTimers();
    
    // Verify the timer was processed
    expect(result.processedCount).toBe(1);
    expect(result.errors).toHaveLength(0);
    
    // Verify the auction status was updated to 'not_sold'
    const updatedAuction = db.prepare('SELECT * FROM auctions WHERE id = 1').get() as Auction;
    expect(updatedAuction.status).toBe('not_sold');
  });
});