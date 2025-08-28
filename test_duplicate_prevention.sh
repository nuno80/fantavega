#!/bin/bash
# Test script to validate duplicate auction prevention
# This script simulates multiple simultaneous auction creation requests

echo "🧪 Testing Duplicate Auction Prevention"
echo "======================================="

# Configuration
LEAGUE_ID="1"
PLAYER_ID="495"
API_URL="http://localhost:3000/api/leagues/${LEAGUE_ID}/start-auction"

echo "📊 Test Configuration:"
echo "  League ID: ${LEAGUE_ID}"
echo "  Player ID: ${PLAYER_ID}"
echo "  API URL: ${API_URL}"
echo ""

# Test payload
PAYLOAD='{"playerId": "'${PLAYER_ID}'", "initialBid": 11}'

echo "📝 Request Payload:"
echo "  ${PAYLOAD}"
echo ""

echo "🚀 Sending 5 simultaneous requests..."
echo "======================================"

# Send 5 simultaneous requests using curl in background
for i in {1..5}; do
  echo "Sending request ${i}..."
  curl -X POST "${API_URL}" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer YOUR_TOKEN_HERE" \
    -d "${PAYLOAD}" \
    --silent \
    --show-error \
    --max-time 10 \
    > "response_${i}.json" 2>&1 &
done

# Wait for all requests to complete
wait

echo ""
echo "📋 Results Summary:"
echo "=================="

# Analyze responses
success_count=0
error_count=0
duplicate_blocked=0

for i in {1..5}; do
  if [ -f "response_${i}.json" ]; then
    response=$(cat "response_${i}.json")
    echo "Response ${i}: ${response}"
    
    if echo "${response}" | grep -q "asta avviata con successo\|auction created successfully"; then
      success_count=$((success_count + 1))
    elif echo "${response}" | grep -q "409\|duplicate\|già in corso\|DUPLICATE REQUEST BLOCKED"; then
      duplicate_blocked=$((duplicate_blocked + 1))
    else
      error_count=$((error_count + 1))
    fi
  fi
done

echo ""
echo "📈 Final Statistics:"
echo "==================="
echo "✅ Successful auction creations: ${success_count}"
echo "🔒 Duplicate requests blocked: ${duplicate_blocked}"
echo "❌ Other errors: ${error_count}"
echo ""

# Cleanup
rm -f response_*.json

if [ ${success_count} -eq 1 ] && [ ${duplicate_blocked} -ge 1 ]; then
  echo "🎉 TEST PASSED: Duplicate prevention is working correctly!"
  exit 0
else
  echo "⚠️  TEST FAILED: Expected exactly 1 success and some blocked duplicates"
  exit 1
fi