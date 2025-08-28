// Test script to reproduce the auction detection issue for player 5672 / auction 1069
// This will help us understand why bids create new auctions instead of updating existing ones

const BASE_URL = 'http://localhost:3000';

async function testAuction1069() {
  console.log('🧪 Testing Auction 1069 Detection Issue');
  console.log('======================================');

  try {
    // Test data from user's logs
    const leagueId = 1000; // From server logs showing league-1000
    const playerId = 5672; // Exact player from user logs
    const auctionId = 1069; // Exact auction from user logs

    console.log(`📊 Test Configuration:`);
    console.log(`  League ID: ${leagueId}`);
    console.log(`  Player ID: ${playerId}`);
    console.log(`  Expected Auction ID: ${auctionId}`);
    console.log('');

    // Step 1: Check if auction 1069 exists for player 5672
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
          timeRemaining: auctionData.time_remaining_seconds,
          isExpected1069: auctionData.id === 1069
        });
        
        if (auctionData.id === 1069) {
          console.log('🎯 FOUND AUCTION 1069! Status:', auctionData.status);
          
          // Step 2: Test making a bid on this auction
          console.log('');
          console.log('🔍 Step 2: Testing bid on auction 1069...');
          
          const bidUrl = `${BASE_URL}/api/leagues/${leagueId}/players/${playerId}/bids`;
          const bidRequest = {
            amount: auctionData.current_highest_bid_amount + 1,
            bid_type: 'manual'
          };
          
          console.log(`POST ${bidUrl}`);
          console.log('Bid request:', bidRequest);
          
          // Note: This will fail due to authentication but should show detection logs
          try {
            const bidResponse = await fetch(bidUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(bidRequest)
            });
            
            console.log(`Bid Response Status: ${bidResponse.status}`);
            const bidResult = await bidResponse.text();
            console.log('Bid Response:', bidResult);
            
          } catch (bidError) {
            console.log(`❌ Bid request failed (expected): ${bidError.message}`);
          }
          
        } else {
          console.log(`❌ Expected auction 1069 but found ${auctionData.id}`);
        }
        
      } else if (auctionResponse.status === 404) {
        console.log('ℹ️ No existing auction found (404)');
        console.log('🚨 THIS IS THE PROBLEM! Auction 1069 should exist but detection fails');
      } else {
        const errorData = await auctionResponse.text();
        console.log(`❌ Error checking auction: ${errorData}`);
      }
    } catch (error) {
      console.log(`❌ Error in auction check: ${error.message}`);
    }

    console.log('');
    console.log('📝 Analysis:');
    console.log('  - If auction 1069 exists with status "active", bid should update it (emit auction-update)');
    console.log('  - If auction detection fails, bid creates new auction (emit auction-created)');
    console.log('  - User reported auction-created events for existing auction 1069');
    console.log('  - This suggests getAuctionStatusForPlayer() is failing to find auction 1069');
    console.log('');
    console.log('🔍 Check the enhanced debug logs in the terminal for detailed auction detection info');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testAuction1069();