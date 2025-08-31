// Simple test script to verify compliance timer processing
async function testComplianceProcessing() {
  try {
    // Dynamically import the penalty service
    const penaltyService = await import('./src/lib/db/services/penalty.service.js');
    
    console.log('Testing compliance timer processing...');
    
    // Call the new function to process expired compliance timers
    const result = await penaltyService.processExpiredComplianceTimers();
    
    console.log('Compliance timer processing completed:');
    console.log(`- Processed: ${result.processedCount}`);
    console.log(`- Errors: ${result.errors.length}`);
    
    if (result.errors.length > 0) {
      console.log('Errors:');
      result.errors.forEach(error => console.log(`  - ${error}`));
    }
  } catch (error) {
    console.error('Error testing compliance processing:', error);
  }
}

// Run the test
testComplianceProcessing();