// Test script to reproduce the bid detection issue
// This will help us understand why bids create new auctions instead of updating existing ones

const BASE_URL = 'http://localhost:3002';

async function testBidDetection() {
  console.log('🧪 Testing Bid Detection Logic');
  console.log('================================');

  try {
    // Test data based on user's issue
    const leagueId = 1;
    const playerId = 6001;

    console.log(`📊 Test Configuration:`);
    console.log(`  League ID: ${leagueId}`);
    console.log(`  Player ID: ${playerId}`);
    console.log('');

    // Step 1: Check if an auction already exists for this player
    console.log('🔍 Step 1: Checking for existing auction...');
    const auctionCheckUrl = `${BASE_URL}/api/leagues/${leagueId}/players/${playerId}/bids`;
    
    console.log(`GET ${auctionCheckUrl}`);
    
    try {
      const auctionResponse = await fetch(auctionCheckUrl);
      console.log(`Response Status: ${auctionResponse.status}`);
      
      if (auctionResponse.ok) {
        const auctionData = await auctionResponse.json();
        console.log('✅ Existing auction found:', {
          id: auctionData.id,
          status: auctionData.status,
          currentBid: auctionData.current_highest_bid_amount,
          scheduledEndTime: auctionData.scheduled_end_time,
          timeRemaining: auctionData.time_remaining_seconds
        });
      } else if (auctionResponse.status === 404) {
        console.log('ℹ️ No existing auction found (404)');
      } else {
        const errorData = await auctionResponse.text();
        console.log(`❌ Error checking auction: ${errorData}`);
      }
    } catch (error) {
      console.log(`❌ Error in auction check: ${error.message}`);
    }

    console.log('');
    console.log('📝 Analysis:');
    console.log('  - If an auction exists with status "active" or "closing", a bid should update it');
    console.log('  - If no auction exists or status is not biddable, a new auction should be created');
    console.log('  - The user reported that their bid created an auction-created event');
    console.log('  - This suggests the detection failed to find an existing active auction');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testBidDetection();