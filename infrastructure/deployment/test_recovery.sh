#!/bin/bash

# Backup recovery edge case testing script
# Tests MCP server's ability to recover from various failure scenarios

set -euo pipefail

# Configuration
SERVER_URL="http://localhost:8081"
BACKUP_DIR="backups"
ORIGINAL_FILE="structured_memory.yaml"
TEST_RESULTS="recovery_test_results.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}" | tee -a "$TEST_RESULTS"
}

# Function to start server in background
start_server() {
    if pgrep -f "memory-mcp.js" > /dev/null; then
        print_status $YELLOW "Server already running, stopping it first..."
        pkill -f "memory-mcp.js" || true
        sleep 2
    fi
    
    print_status $BLUE "Starting MCP server..."
    node memory-mcp.js > server_test.log 2>&1 &
    local server_pid=$!
    
    # Wait for server to start
    for i in {1..10}; do
        if curl -s "$SERVER_URL/health" > /dev/null 2>&1; then
            print_status $GREEN "✅ Server started successfully (PID: $server_pid)"
            echo $server_pid
            return 0
        fi
        sleep 1
    done
    
    print_status $RED "❌ Server failed to start"
    return 1
}

# Function to stop server
stop_server() {
    local pid=$1
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        print_status $BLUE "Stopping server (PID: $pid)..."
        kill "$pid" 2>/dev/null || true
        sleep 2
    fi
}

# Function to test server response
test_server_response() {
    local test_name="$1"
    local expected_status="$2"
    
    print_status $BLUE "Testing: $test_name"
    
    local response=$(curl -s -w "%{http_code}" \
                         -X POST \
                         -H "Content-Type: application/json" \
                         -d '{"problem":"OAuth PKCE intent not triggering"}' \
                         "$SERVER_URL" 2>/dev/null)
    
    local http_code=$(echo "$response" | tail -c 4)
    local body=$(echo "$response" | head -c -4)
    
    if [ "$http_code" = "$expected_status" ]; then
        print_status $GREEN "  ✅ Response: HTTP $http_code (expected)"
        if [ "$http_code" = "200" ]; then
            local found=$(echo "$body" | grep -o '"found":[^,}]*' | cut -d':' -f2)
            print_status $YELLOW "  📊 Solution found: $found"
        fi
        return 0
    else
        print_status $RED "  ❌ Response: HTTP $http_code (expected $expected_status)"
        print_status $RED "  📄 Body: $body"
        return 1
    fi
}

# Function to backup original file
backup_original() {
    if [ -f "$ORIGINAL_FILE" ]; then
        cp "$ORIGINAL_FILE" "${ORIGINAL_FILE}.test_backup"
        print_status $GREEN "✅ Original file backed up"
    else
        print_status $YELLOW "⚠️  No original file to backup"
    fi
}

# Function to restore original file
restore_original() {
    if [ -f "${ORIGINAL_FILE}.test_backup" ]; then
        cp "${ORIGINAL_FILE}.test_backup" "$ORIGINAL_FILE"
        rm "${ORIGINAL_FILE}.test_backup"
        print_status $GREEN "✅ Original file restored"
    else
        print_status $YELLOW "⚠️  No backup to restore"
    fi
}

# Test 1: Corrupted YAML syntax
test_corrupted_yaml() {
    print_status $BLUE "🧪 Test 1: Corrupted YAML Syntax"
    
    echo "invalid: yaml: syntax: [unclosed" > "$ORIGINAL_FILE"
    print_status $YELLOW "  📝 Created corrupted YAML file"
    
    local server_pid=$(start_server)
    if [ $? -eq 0 ]; then
        sleep 3  # Give server time to load files
        test_server_response "Corrupted YAML" "200"
        
        # Check if backup was used
        if grep -q "backup" server_test.log; then
            print_status $GREEN "  ✅ Server used backup recovery"
        else
            print_status $YELLOW "  ⚠️  Server may not have used backup"
        fi
        
        stop_server "$server_pid"
    fi
    
    print_status $BLUE "  📊 Test 1 Result: $([ $? -eq 0 ] && echo "PASS" || echo "FAIL")"
}

# Test 2: Empty file
test_empty_file() {
    print_status $BLUE "🧪 Test 2: Empty Memory File"
    
    > "$ORIGINAL_FILE"  # Create empty file
    print_status $YELLOW "  📝 Created empty memory file"
    
    local server_pid=$(start_server)
    if [ $? -eq 0 ]; then
        sleep 3
        test_server_response "Empty file" "200"
        stop_server "$server_pid"
    fi
    
    print_status $BLUE "  📊 Test 2 Result: $([ $? -eq 0 ] && echo "PASS" || echo "FAIL")"
}

# Test 3: Missing file
test_missing_file() {
    print_status $BLUE "🧪 Test 3: Missing Memory File"
    
    if [ -f "$ORIGINAL_FILE" ]; then
        rm "$ORIGINAL_FILE"
        print_status $YELLOW "  📝 Removed memory file"
    fi
    
    local server_pid=$(start_server)
    if [ $? -eq 0 ]; then
        sleep 3
        test_server_response "Missing file" "200"
        stop_server "$server_pid"
    fi
    
    print_status $BLUE "  📊 Test 3 Result: $([ $? -eq 0 ] && echo "PASS" || echo "FAIL")"
}

# Test 4: Partial corruption (valid YAML but invalid structure)
test_invalid_structure() {
    print_status $BLUE "🧪 Test 4: Invalid Structure"
    
    cat > "$ORIGINAL_FILE" << 'EOF'
invalid_structure:
  not_lessons_learned:
    - this_is_wrong
metadata:
  invalid: true
EOF
    print_status $YELLOW "  📝 Created file with invalid structure"
    
    local server_pid=$(start_server)
    if [ $? -eq 0 ]; then
        sleep 3
        test_server_response "Invalid structure" "200"
        stop_server "$server_pid"
    fi
    
    print_status $BLUE "  📊 Test 4 Result: $([ $? -eq 0 ] && echo "PASS" || echo "FAIL")"
}

# Test 5: No backups available
test_no_backups() {
    print_status $BLUE "🧪 Test 5: No Backups Available"
    
    # Remove all backups temporarily
    local backup_temp_dir="/tmp/backup_test_$$"
    if [ -d "$BACKUP_DIR" ]; then
        mv "$BACKUP_DIR" "$backup_temp_dir"
        print_status $YELLOW "  📝 Moved backups to temporary location"
    fi
    mkdir -p "$BACKUP_DIR"  # Create empty backup dir
    
    # Create corrupted file
    echo "invalid: yaml: [[[" > "$ORIGINAL_FILE"
    
    local server_pid=$(start_server)
    if [ $? -eq 0 ]; then
        sleep 3
        # Should still respond but with empty structure
        test_server_response "No backups" "200"
        stop_server "$server_pid"
    fi
    
    # Restore backups
    if [ -d "$backup_temp_dir" ]; then
        rm -rf "$BACKUP_DIR"
        mv "$backup_temp_dir" "$BACKUP_DIR"
        print_status $YELLOW "  📝 Restored backups"
    fi
    
    print_status $BLUE "  📊 Test 5 Result: $([ $? -eq 0 ] && echo "PASS" || echo "FAIL")"
}

# Test 6: Multiple corrupted files
test_multiple_corruptions() {
    print_status $BLUE "🧪 Test 6: Multiple File Corruptions"
    
    # Corrupt both memory files
    echo "invalid: yaml: 1" > "$ORIGINAL_FILE"
    echo "invalid: yaml: 2" > "global_structured_memory.yaml"
    echo "invalid: yaml: 3" > "error_categories.yaml"
    print_status $YELLOW "  📝 Corrupted multiple files"
    
    local server_pid=$(start_server)
    if [ $? -eq 0 ]; then
        sleep 3
        test_server_response "Multiple corruptions" "200"
        stop_server "$server_pid"
    fi
    
    print_status $BLUE "  📊 Test 6 Result: $([ $? -eq 0 ] && echo "PASS" || echo "FAIL")"
}

# Test 7: Recovery performance under load
test_recovery_performance() {
    print_status $BLUE "🧪 Test 7: Recovery Performance Under Load"
    
    echo "invalid: yaml: performance" > "$ORIGINAL_FILE"
    
    local server_pid=$(start_server)
    if [ $? -eq 0 ]; then
        sleep 3
        
        # Send multiple concurrent requests
        print_status $YELLOW "  📈 Sending 20 concurrent requests..."
        for i in {1..20}; do
            curl -s -X POST -H "Content-Type: application/json" \
                 -d '{"problem":"performance test"}' \
                 "$SERVER_URL" > /dev/null &
        done
        
        wait  # Wait for all requests to complete
        
        test_server_response "Recovery under load" "200"
        stop_server "$server_pid"
    fi
    
    print_status $BLUE "  📊 Test 7 Result: $([ $? -eq 0 ] && echo "PASS" || echo "FAIL")"
}

# Function to generate recovery report
generate_report() {
    local total_tests=7
    local passed_tests=$(grep -c "📊.*PASS" "$TEST_RESULTS" || echo "0")
    local failed_tests=$((total_tests - passed_tests))
    
    {
        echo ""
        echo "========================================="
        echo "Backup Recovery Test Summary"
        echo "========================================="
        echo "Test Date: $(date)"
        echo "Server URL: $SERVER_URL"
        echo ""
        echo "Results:"
        echo "  Total Tests: $total_tests"
        echo "  Passed: $passed_tests"
        echo "  Failed: $failed_tests"
        echo "  Success Rate: $(echo "scale=1; $passed_tests * 100 / $total_tests" | bc -l)%"
        echo ""
        
        if [ $passed_tests -eq $total_tests ]; then
            echo "🎉 ALL TESTS PASSED - Backup recovery is working correctly"
        elif [ $passed_tests -ge $((total_tests * 3 / 4)) ]; then
            echo "✅ MOSTLY PASSING - Minor issues may need attention"
        elif [ $passed_tests -ge $((total_tests / 2)) ]; then
            echo "⚠️  PARTIAL SUCCESS - Several issues need investigation"
        else
            echo "❌ CRITICAL ISSUES - Backup recovery needs immediate attention"
        fi
        
        echo ""
        echo "Detailed Results:"
        grep "📊" "$TEST_RESULTS" || echo "No detailed results found"
        echo ""
        echo "Server Logs: server_test.log"
        echo "========================================="
    } | tee -a "$TEST_RESULTS"
}

# Main execution
main() {
    print_status $BLUE "🔄 Backup Recovery Edge Case Testing"
    print_status $BLUE "======================================"
    
    # Initialize results file
    {
        echo "Backup Recovery Test Results"
        echo "Started: $(date)"
        echo "========================================="
    } > "$TEST_RESULTS"
    
    # Check prerequisites
    if ! command -v node &> /dev/null; then
        print_status $RED "Error: Node.js is required but not installed"
        exit 1
    fi
    
    if [ ! -f "memory-mcp.js" ]; then
        print_status $RED "Error: memory-mcp.js not found in current directory"
        exit 1
    fi
    
    # Backup original files
    backup_original
    
    # Run tests
    print_status $BLUE "Starting recovery tests..."
    
    test_corrupted_yaml
    restore_original && backup_original
    
    test_empty_file
    restore_original && backup_original
    
    test_missing_file
    restore_original && backup_original
    
    test_invalid_structure
    restore_original && backup_original
    
    test_no_backups
    restore_original && backup_original
    
    test_multiple_corruptions
    restore_original && backup_original
    
    test_recovery_performance
    restore_original
    
    # Generate final report
    generate_report
    
    # Cleanup
    rm -f server_test.log
    
    print_status $GREEN "✅ Recovery testing completed!"
    print_status $YELLOW "📊 Results saved to: $TEST_RESULTS"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --url)
            SERVER_URL="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  --url URL        Server URL (default: $SERVER_URL)"
            echo "  --help           Show this help message"
            echo ""
            echo "This script tests the MCP server's backup recovery capabilities"
            echo "by simulating various file corruption scenarios."
            exit 0
            ;;
        *)
            print_status $RED "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Ensure we're in the right directory
if [ ! -f "memory-mcp.js" ]; then
    print_status $RED "Error: Please run this script from the brains directory"
    exit 1
fi

# Run main function
main