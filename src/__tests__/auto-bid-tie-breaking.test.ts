import { describe, it, expect } from 'vitest';
import { AutoBidBattleParticipant, simulateAutoBidBattle } from '../lib/db/services/bid.service';

describe('Auto-Bid Tie Breaking Logic', () => {
  it('should handle tie-breaking correctly when auto-bid was set first', () => {
    // Scenario: User1 has an auto-bid at 40 credits (set first at time 1000), 
    // User2 places a manual bid at 40 credits (set later)
    // User1 should win because they set their auto-bid first
    
    const initialBid = 40;
    const initialBidderId = 'user2'; // User2 is placing the manual bid
    const autoBids: AutoBidBattleParticipant[] = [
      {
        userId: 'user1', // User1 has auto-bid at 40
        maxAmount: 40,
        createdAt: 1000, // User1 set their auto-bid first
        isActive: true
      }
    ];
    
    const result = simulateAutoBidBattle(initialBid, initialBidderId, autoBids);
    
    // Expected: User1 should win because they set their auto-bid first (earlier createdAt)
    expect(result.finalBidderId).toBe('user1');
    // User1 should pay their maximum amount in case of a tie
    expect(result.finalAmount).toBe(40);
    // User1 should not have won with their manual bid (they used auto-bid)
    expect(result.initialBidderHadWinningManualBid).toBe(false);
  });
  
  it('should handle tie-breaking correctly when manual bidder is first', () => {
    // Scenario: User2 places a manual bid at 40 credits (set first),
    // then User1 sets auto-bid at 40 credits (set later at time 2000)
    // User2 should win because they were first
    
    const initialBid = 40;
    const initialBidderId = 'user2'; // User2 is placing the manual bid first
    const autoBids: AutoBidBattleParticipant[] = [
      {
        userId: 'user1', // User1 sets auto-bid after User2's manual bid
        maxAmount: 40,
        createdAt: 2000, // User1 set their auto-bid after User2's manual bid
        isActive: true
      }
    ];
    
    const result = simulateAutoBidBattle(initialBid, initialBidderId, autoBids);
    
    // Expected: User2 should win because they were first (manual bid)
    expect(result.finalBidderId).toBe('user2');
    // User2 should pay their bid amount
    expect(result.finalAmount).toBe(40);
    // User2 should have won with their manual bid
    expect(result.initialBidderHadWinningManualBid).toBe(true);
  });
  
  it('should handle case with no competing auto-bids', () => {
    // Scenario: User2 places a manual bid at 40 credits, no auto-bids exist
    // User2 should win with their manual bid
    
    const initialBid = 40;
    const initialBidderId = 'user2';
    const autoBids: AutoBidBattleParticipant[] = []; // No auto-bids
    
    const result = simulateAutoBidBattle(initialBid, initialBidderId, autoBids);
    
    // Expected: User2 should win with their manual bid
    expect(result.finalBidderId).toBe('user2');
    expect(result.finalAmount).toBe(40);
    expect(result.initialBidderHadWinningManualBid).toBe(true);
  });
  
  it('should handle case with higher auto-bid', () => {
    // Scenario: User1 has an auto-bid at 50 credits, User2 places a manual bid at 40 credits
    // User1 should win with their higher auto-bid
    
    const initialBid = 40;
    const initialBidderId = 'user2'; // User2 is placing the manual bid
    const autoBids: AutoBidBattleParticipant[] = [
      {
        userId: 'user1', // User1 has higher auto-bid at 50
        maxAmount: 50,
        createdAt: 1000,
        isActive: true
      }
    ];
    
    const result = simulateAutoBidBattle(initialBid, initialBidderId, autoBids);
    
    // Expected: User1 should win with their higher auto-bid
    expect(result.finalBidderId).toBe('user1');
    // User1 should pay 1 more than User2's bid (40 + 1 = 41)
    expect(result.finalAmount).toBe(41);
    expect(result.initialBidderHadWinningManualBid).toBe(false);
  });
});