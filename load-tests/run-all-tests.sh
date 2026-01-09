#!/bin/bash

# UK CRM Load Testing - Run All Tests
#
# This script runs all load tests in sequence
# and generates a comprehensive report.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="${BASE_URL:-https://uk-crm.shaxzod.workers.dev}"
OUTPUT_DIR="./results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}   UK CRM Load Testing Suite${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo -e "Target URL: ${GREEN}$BASE_URL${NC}"
echo -e "Results: ${GREEN}$OUTPUT_DIR${NC}"
echo ""

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
    echo -e "${RED}ERROR: k6 is not installed${NC}"
    echo "Install k6: https://k6.io/docs/getting-started/installation/"
    exit 1
fi

# Create results directory
mkdir -p "$OUTPUT_DIR"

# Function to run a test
run_test() {
    local test_name=$1
    local test_file=$2
    local output_file="$OUTPUT_DIR/${test_name}_${TIMESTAMP}.json"

    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}Running: $test_name${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    BASE_URL=$BASE_URL k6 run \
        --out json="$output_file" \
        --summary-export="$OUTPUT_DIR/${test_name}_summary_${TIMESTAMP}.json" \
        "$test_file" || true

    echo ""
    echo -e "${GREEN}✓ Test completed: $test_name${NC}"
    echo -e "Results saved to: ${BLUE}$output_file${NC}"
    echo ""
}

# Ask for confirmation
echo -e "${YELLOW}WARNING: This will generate significant load on the system!${NC}"
echo -e "Continue? (yes/no): "
read -r confirmation

if [ "$confirmation" != "yes" ]; then
    echo "Aborted."
    exit 0
fi

# Run tests in sequence
echo ""
echo -e "${BLUE}Starting load tests...${NC}"
echo ""

# Test 1: API Load Test
run_test "api_load_test" "api-load-test.js"
sleep 30  # Cool-down period

# Test 2: WebSocket Load Test
run_test "websocket_load_test" "websocket-load-test.js"
sleep 30  # Cool-down period

# Test 3: Stress Test
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${RED}WARNING: Starting STRESS TEST${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "This test will generate HEAVY load."
echo -e "Continue? (yes/no): "
read -r stress_confirmation

if [ "$stress_confirmation" = "yes" ]; then
    run_test "stress_test" "stress-test.js"
else
    echo -e "${YELLOW}Skipped stress test${NC}"
fi

# Generate summary report
echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}   Test Results Summary${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

for summary_file in "$OUTPUT_DIR"/*_summary_${TIMESTAMP}.json; do
    if [ -f "$summary_file" ]; then
        echo -e "${GREEN}$(basename "$summary_file" | sed 's/_summary.*//')${NC}"
        echo "─────────────────────────────────────────"

        # Extract key metrics using jq
        if command -v jq &> /dev/null; then
            jq -r '
                "  Requests: \(.metrics.http_reqs.values.count // 0)",
                "  Failed: \(.metrics.http_req_failed.values.rate * 100 // 0 | floor)%",
                "  Avg Duration: \(.metrics.http_req_duration.values.avg // 0 | floor)ms",
                "  P95 Duration: \(.metrics.http_req_duration.values["p(95)"] // 0 | floor)ms",
                "  P99 Duration: \(.metrics.http_req_duration.values["p(99)"] // 0 | floor)ms"
            ' "$summary_file"
        else
            echo "  (install jq for detailed metrics)"
        fi
        echo ""
    fi
done

echo -e "${GREEN}✓ All tests completed!${NC}"
echo -e "Full results available in: ${BLUE}$OUTPUT_DIR${NC}"
echo ""

# Cleanup old results (keep last 10)
echo "Cleaning up old results..."
ls -t "$OUTPUT_DIR"/*.json 2>/dev/null | tail -n +21 | xargs -r rm
echo -e "${GREEN}✓ Cleanup complete${NC}"
echo ""

exit 0
