#!/bin/bash

# High-load stress testing script for Brains Memory System
# Tests MCP server performance under concurrent load

set -euo pipefail

# Configuration
SERVER_URL="http://localhost:8081"
CONCURRENT_REQUESTS=100
TOTAL_REQUESTS=1000
TEST_DURATION=60  # seconds
RESULTS_FILE="stress_test_results.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test problems for variety
TEST_PROBLEMS=(
    "OAuth PKCE intent not triggering"
    "HTTP timeout on large uploads"
    "Database connection failed"
    "Memory allocation error"
    "File permission denied"
    "Token refresh failing silently"
    "CORS preflight request failing"
    "SSL certificate verification error"
    "Rate limit exceeded"
    "JSON parsing error"
    "Configuration file not found"
    "Network connection timeout"
    "Authentication failed"
    "Invalid request format"
    "Server internal error"
)

# Function to print colored output
print_status() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Function to check if server is running
check_server() {
    if curl -s "${SERVER_URL}/health" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Function to send a single request
send_request() {
    local problem=$1
    local start_time=$(date +%s.%N)
    
    local response=$(curl -s -w "%{http_code}:%{time_total}" \
                         -X POST \
                         -H "Content-Type: application/json" \
                         -d "{\"problem\":\"${problem}\"}" \
                         "${SERVER_URL}" 2>/dev/null)
    
    local end_time=$(date +%s.%N)
    local duration=$(echo "$end_time - $start_time" | bc -l)
    
    # Extract HTTP code and response time
    local http_code=$(echo "$response" | tail -c 10 | cut -d':' -f1)
    local response_time=$(echo "$response" | tail -c 10 | cut -d':' -f2)
    
    echo "${http_code},${response_time},${duration}" >> "${RESULTS_FILE}.tmp"
}

# Function to run concurrent requests
run_concurrent_test() {
    local num_requests=$1
    local batch_size=$2
    
    print_status $BLUE "Running $num_requests requests in batches of $batch_size..."
    
    # Clear temporary results
    > "${RESULTS_FILE}.tmp"
    
    local completed=0
    local start_time=$(date +%s)
    
    while [ $completed -lt $num_requests ]; do
        local batch_end=$((completed + batch_size))
        if [ $batch_end -gt $num_requests ]; then
            batch_end=$num_requests
        fi
        
        # Start batch of requests in background
        for i in $(seq $((completed + 1)) $batch_end); do
            local problem_index=$((i % ${#TEST_PROBLEMS[@]}))
            local problem="${TEST_PROBLEMS[$problem_index]}"
            send_request "$problem" &
        done
        
        # Wait for batch to complete
        wait
        
        completed=$batch_end
        local elapsed=$(($(date +%s) - start_time))
        local rate=$((completed * 60 / elapsed))
        
        print_status $YELLOW "Progress: $completed/$num_requests requests ($rate req/min)"
    done
    
    local total_time=$(($(date +%s) - start_time))
    print_status $GREEN "Completed $num_requests requests in ${total_time}s"
}

# Function to analyze results
analyze_results() {
    if [ ! -f "${RESULTS_FILE}.tmp" ]; then
        print_status $RED "No results file found"
        return 1
    fi
    
    local total_requests=$(wc -l < "${RESULTS_FILE}.tmp")
    local successful_requests=$(grep -c "^200," "${RESULTS_FILE}.tmp" || echo "0")
    local failed_requests=$((total_requests - successful_requests))
    
    # Calculate response time statistics
    local avg_response_time=$(awk -F',' '{sum+=$2; count++} END {print sum/count}' "${RESULTS_FILE}.tmp")
    local min_response_time=$(awk -F',' '{print $2}' "${RESULTS_FILE}.tmp" | sort -n | head -1)
    local max_response_time=$(awk -F',' '{print $2}' "${RESULTS_FILE}.tmp" | sort -n | tail -1)
    
    # Calculate percentiles
    local p95_response_time=$(awk -F',' '{print $2}' "${RESULTS_FILE}.tmp" | sort -n | awk 'BEGIN{c=0} {a[c++]=$1} END{print a[int(c*0.95)]}')
    local p99_response_time=$(awk -F',' '{print $2}' "${RESULTS_FILE}.tmp" | sort -n | awk 'BEGIN{c=0} {a[c++]=$1} END{print a[int(c*0.99)]}')
    
    # Success rate
    local success_rate=$(echo "scale=2; $successful_requests * 100 / $total_requests" | bc -l)
    
    # Generate report
    {
        echo "========================================="
        echo "Brains Memory System Stress Test Results"
        echo "========================================="
        echo "Test Date: $(date)"
        echo "Server URL: $SERVER_URL"
        echo ""
        echo "Test Configuration:"
        echo "  Total Requests: $total_requests"
        echo "  Concurrent Requests: $CONCURRENT_REQUESTS"
        echo ""
        echo "Results Summary:"
        echo "  Successful Requests: $successful_requests"
        echo "  Failed Requests: $failed_requests"
        echo "  Success Rate: ${success_rate}%"
        echo ""
        echo "Response Time Statistics (seconds):"
        echo "  Average: $avg_response_time"
        echo "  Minimum: $min_response_time"
        echo "  Maximum: $max_response_time"
        echo "  95th Percentile: $p95_response_time"
        echo "  99th Percentile: $p99_response_time"
        echo ""
        echo "Performance Assessment:"
        
        # Performance thresholds
        local avg_ms=$(echo "$avg_response_time * 1000" | bc -l | cut -d'.' -f1)
        local p95_ms=$(echo "$p95_response_time * 1000" | bc -l | cut -d'.' -f1)
        
        if [ "$avg_ms" -lt 100 ] && [ "$p95_ms" -lt 500 ]; then
            echo "  ✅ EXCELLENT - Very fast response times"
        elif [ "$avg_ms" -lt 500 ] && [ "$p95_ms" -lt 1000 ]; then
            echo "  ✅ GOOD - Acceptable response times"
        elif [ "$avg_ms" -lt 1000 ] && [ "$p95_ms" -lt 2000 ]; then
            echo "  ⚠️  FAIR - Response times could be improved"
        else
            echo "  ❌ POOR - Response times need optimization"
        fi
        
        if [ "$success_rate" = "100.00" ]; then
            echo "  ✅ EXCELLENT - No failed requests"
        elif (( $(echo "$success_rate >= 99" | bc -l) )); then
            echo "  ✅ GOOD - Very low failure rate"
        elif (( $(echo "$success_rate >= 95" | bc -l) )); then
            echo "  ⚠️  FAIR - Some requests failed"
        else
            echo "  ❌ POOR - High failure rate needs investigation"
        fi
        
        echo ""
        echo "Raw Data: ${RESULTS_FILE}.tmp"
        echo "========================================="
    } | tee "$RESULTS_FILE"
    
    # Move temp file
    mv "${RESULTS_FILE}.tmp" "${RESULTS_FILE}.raw"
}

# Function to monitor server resources during test
monitor_resources() {
    local duration=$1
    local monitor_file="resource_monitor.log"
    
    {
        echo "Timestamp,CPU%,Memory%,DiskIO"
        for i in $(seq 1 $duration); do
            local timestamp=$(date +"%Y-%m-%d %H:%M:%S")
            local cpu_usage=$(top -bn1 | grep "node" | awk '{print $9}' | head -1 || echo "0")
            local memory_usage=$(ps -eo pid,ppid,cmd,%mem,%cpu | grep "node memory-mcp.js" | awk '{print $4}' | head -1 || echo "0")
            local disk_io=$(iostat -x 1 1 2>/dev/null | tail -1 | awk '{print $4}' || echo "0")
            
            echo "$timestamp,$cpu_usage,$memory_usage,$disk_io"
            sleep 1
        done
    } > "$monitor_file" &
    
    local monitor_pid=$!
    echo $monitor_pid
}

# Main execution
main() {
    print_status $BLUE "🧠 Brains Memory System Stress Test"
    print_status $BLUE "====================================="
    
    # Check prerequisites
    if ! command -v curl &> /dev/null; then
        print_status $RED "Error: curl is required but not installed"
        exit 1
    fi
    
    if ! command -v bc &> /dev/null; then
        print_status $RED "Error: bc is required but not installed"
        exit 1
    fi
    
    # Check server availability
    print_status $YELLOW "Checking server availability..."
    if ! check_server; then
        print_status $RED "Error: Server is not responding at $SERVER_URL"
        print_status $YELLOW "Make sure the MCP server is running: node memory-mcp.js"
        exit 1
    fi
    
    print_status $GREEN "✅ Server is responding"
    
    # Warm up server
    print_status $YELLOW "Warming up server..."
    for i in {1..5}; do
        send_request "warmup test request" > /dev/null 2>&1
    done
    
    # Start resource monitoring
    print_status $YELLOW "Starting resource monitoring..."
    local monitor_pid=$(monitor_resources $((TOTAL_REQUESTS / 10 + 10)))
    
    # Run stress test
    print_status $BLUE "Starting stress test..."
    print_status $YELLOW "Configuration: $TOTAL_REQUESTS requests, $CONCURRENT_REQUESTS concurrent"
    
    run_concurrent_test $TOTAL_REQUESTS $CONCURRENT_REQUESTS
    
    # Stop resource monitoring
    kill $monitor_pid 2>/dev/null || true
    
    # Analyze results
    print_status $BLUE "Analyzing results..."
    analyze_results
    
    print_status $GREEN "✅ Stress test completed!"
    print_status $YELLOW "📊 Results saved to: $RESULTS_FILE"
    print_status $YELLOW "📈 Resource monitoring: resource_monitor.log"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --requests)
            TOTAL_REQUESTS="$2"
            shift 2
            ;;
        --concurrent)
            CONCURRENT_REQUESTS="$2"
            shift 2
            ;;
        --url)
            SERVER_URL="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  --requests N     Total number of requests (default: $TOTAL_REQUESTS)"
            echo "  --concurrent N   Concurrent requests (default: $CONCURRENT_REQUESTS)"
            echo "  --url URL        Server URL (default: $SERVER_URL)"
            echo "  --help           Show this help message"
            exit 0
            ;;
        *)
            print_status $RED "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Run main function
main