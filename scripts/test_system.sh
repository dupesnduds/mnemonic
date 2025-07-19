#!/bin/bash

# Comprehensive test script for mnemonic memory system validation
echo "🧠 Testing Mnemonic Memory System"
echo "================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

FAILED_TESTS=0
TOTAL_TESTS=0

# Function to print test results
print_result() {
    local test_name="$1"
    local result="$2"
    local details="$3"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    if [ "$result" = "PASS" ]; then
        echo -e "${GREEN}✓${NC} $test_name"
        [ -n "$details" ] && echo "  └─ $details"
    else
        echo -e "${RED}✗${NC} $test_name"
        [ -n "$details" ] && echo "  └─ $details"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
}

# Test 1: File existence
echo -e "\n${YELLOW}1. File Existence Tests${NC}"
for file in "memory-mcp.js" "error_categories.yaml" "update_memory.py" "structured_memory.yaml" "global_structured_memory.yaml" "package.json"; do
    if [ -f "$file" ]; then
        print_result "File exists: $file" "PASS"
    else
        print_result "File exists: $file" "FAIL" "File not found"
    fi
done

# Test 2: Python dependencies
echo -e "\n${YELLOW}2. Python Dependencies${NC}"
if command -v python3 &> /dev/null; then
    print_result "Python3 available" "PASS"
    
    if python3 -c "import yaml" 2>/dev/null; then
        print_result "PyYAML installed" "PASS"
    else
        print_result "PyYAML installed" "FAIL" "pip install pyyaml"
    fi
else
    print_result "Python3 available" "FAIL" "Python3 not found"
fi

# Test 3: Node.js dependencies
echo -e "\n${YELLOW}3. Node.js Dependencies${NC}"
if command -v node &> /dev/null; then
    print_result "Node.js available" "PASS" "$(node --version)"
    
    if command -v npm &> /dev/null; then
        print_result "NPM available" "PASS"
        
        # Install dependencies if needed
        if [ ! -d "node_modules" ]; then
            echo "  Installing dependencies..."
            npm install &>/dev/null
        fi
        
        if [ -d "node_modules/js-yaml" ] && [ -d "node_modules/express" ]; then
            print_result "Required packages installed" "PASS"
        else
            print_result "Required packages installed" "FAIL" "Run: npm install"
        fi
    else
        print_result "NPM available" "FAIL"
    fi
else
    print_result "Node.js available" "FAIL" "Node.js not found"
fi

# Test 4: YAML validation
echo -e "\n${YELLOW}4. YAML Validation${NC}"
for yaml_file in "error_categories.yaml" "structured_memory.yaml" "global_structured_memory.yaml"; do
    if [ -f "$yaml_file" ]; then
        if python3 -c "import yaml; yaml.safe_load(open('$yaml_file'))" 2>/dev/null; then
            print_result "YAML valid: $yaml_file" "PASS"
        else
            print_result "YAML valid: $yaml_file" "FAIL" "Invalid YAML syntax"
        fi
    fi
done

# Test 5: Memory script functionality
echo -e "\n${YELLOW}5. Memory Script Tests${NC}"
if [ -f "update_memory.py" ] && [ -x "update_memory.py" ]; then
    print_result "update_memory.py executable" "PASS"
    
    # Test adding a solution
    if python3 update_memory.py "test_problem" "test_solution" "authentication" 2>/dev/null; then
        print_result "Add solution functionality" "PASS"
        
        # Check if backup was created
        if [ -d "backups" ] && [ "$(ls -1 backups/ | wc -l)" -gt 0 ]; then
            print_result "Backup creation" "PASS"
        else
            print_result "Backup creation" "FAIL" "No backup files found"
        fi
    else
        print_result "Add solution functionality" "FAIL" "Script execution failed"
    fi
else
    print_result "update_memory.py executable" "FAIL" "Script not executable"
fi

# Test 6: MCP Server functionality (if Node.js dependencies are available)
echo -e "\n${YELLOW}6. MCP Server Tests${NC}"
if [ -d "node_modules" ]; then
    # Start server in background
    node memory-mcp.js &
    SERVER_PID=$!
    
    # Wait for server to start
    sleep 2
    
    # Test health endpoint
    if curl -s http://localhost:8081/health > /dev/null 2>&1; then
        print_result "Server health endpoint" "PASS"
        
        # Test memory lookup
        response=$(curl -s -X POST -H "Content-Type: application/json" \
                   -d '{"problem":"OAuth PKCE intent not triggering"}' \
                   http://localhost:8081 2>/dev/null)
        
        if echo "$response" | grep -q "category"; then
            print_result "Memory lookup endpoint" "PASS"
        else
            print_result "Memory lookup endpoint" "FAIL" "Invalid response"
        fi
        
        # Test stats endpoint
        if curl -s http://localhost:8081/stats | grep -q "project_memory" 2>/dev/null; then
            print_result "Statistics endpoint" "PASS"
        else
            print_result "Statistics endpoint" "FAIL"
        fi
    else
        print_result "Server health endpoint" "FAIL" "Server not responding"
    fi
    
    # Stop server
    kill $SERVER_PID 2>/dev/null
    wait $SERVER_PID 2>/dev/null
else
    print_result "MCP Server tests" "SKIP" "Node.js dependencies not installed"
fi

# Test 7: Error categorization
echo -e "\n${YELLOW}7. Error Categorization Tests${NC}"
test_errors=(
    "OAuth PKCE intent not triggering:authentication"
    "HTTP timeout error:networking"
    "Database connection failed:database"
    "File not found error:filesystem"
    "Unknown random error:errors_uncategorised"
)

for test_case in "${test_errors[@]}"; do
    IFS=':' read -r error expected <<< "$test_case"
    
    if [ -f "update_memory.py" ]; then
        # Test categorization (dry run - capture category output)
        category=$(python3 -c "
import sys
sys.path.append('.')
from update_memory import categorise_error_cli
print(categorise_error_cli('$error'))
" 2>/dev/null)
        
        if [ "$category" = "$expected" ]; then
            print_result "Categorize: $error" "PASS" "→ $category"
        else
            print_result "Categorize: $error" "FAIL" "Expected $expected, got $category"
        fi
    fi
done

# Summary
echo -e "\n${YELLOW}Test Summary${NC}"
echo "============="
PASSED_TESTS=$((TOTAL_TESTS - FAILED_TESTS))
echo "Total tests: $TOTAL_TESTS"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "\n${GREEN}🎉 All tests passed! System is ready.${NC}"
    exit 0
else
    echo -e "\n${RED}❌ Some tests failed. Please check the issues above.${NC}"
    exit 1
fi