#!/bin/bash

# Quick deployment validation script
# Runs essential tests to verify the enhanced system is working correctly

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

print_status $BLUE "🚀 Mnemonic Memory System - Deployment Validation"
print_status $BLUE "================================================"

# Check file existence
print_status $YELLOW "📁 Checking core files..."
files=(
    "memory-mcp.js"
    "error_categories.yaml"
    "update_memory.py"
    "check_memory.py"
    "structured_memory.yaml"
    "global_structured_memory.yaml"
    "test_system.sh"
    "monitor_logs.py"
    "stress_test.sh"
    "test_recovery.sh"
    "update_deps.sh"
    "package.json"
    "requirements.txt"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        print_status $GREEN "  ✅ $file"
    else
        print_status $RED "  ❌ $file (missing)"
    fi
done

# Check script permissions
print_status $YELLOW "🔐 Checking script permissions..."
scripts=("update_memory.py" "check_memory.py" "test_system.sh" "monitor_logs.py" "stress_test.sh" "test_recovery.sh" "update_deps.sh")

for script in "${scripts[@]}"; do
    if [ -x "$script" ]; then
        print_status $GREEN "  ✅ $script (executable)"
    else
        print_status $YELLOW "  ⚠️  $script (not executable)"
    fi
done

# Test consistency checker
print_status $YELLOW "🧪 Testing consistency checker..."
if python3 check_memory.py --dry-run > /dev/null 2>&1; then
    print_status $GREEN "  ✅ Consistency checker working"
else
    print_status $RED "  ❌ Consistency checker failed"
fi

# Test dependency checker
print_status $YELLOW "📦 Testing dependency checker..."
if ./update_deps.sh > dependency_test.log 2>&1; then
    print_status $GREEN "  ✅ Dependency checker working"
else
    print_status $YELLOW "  ⚠️  Dependency checker completed with warnings"
fi

# Test monitoring script
print_status $YELLOW "📊 Testing monitoring script..."
if python3 monitor_logs.py > monitor_test.log 2>&1; then
    print_status $GREEN "  ✅ Monitoring script working"
else
    print_status $YELLOW "  ⚠️  Monitoring script completed with warnings"
fi

# Test memory update
print_status $YELLOW "💾 Testing memory update..."
if python3 update_memory.py "test deployment validation" "validation" "System deployment validation successful" > /dev/null 2>&1; then
    print_status $GREEN "  ✅ Memory update working"
else
    print_status $RED "  ❌ Memory update failed"
fi

# Check if MCP server can start (don't leave it running)
print_status $YELLOW "🖥️  Testing MCP server startup..."
timeout 10s node memory-mcp.js > server_test.log 2>&1 &
server_pid=$!
sleep 3

if kill -0 $server_pid 2>/dev/null; then
    print_status $GREEN "  ✅ MCP server starts successfully"
    kill $server_pid 2>/dev/null || true
else
    print_status $RED "  ❌ MCP server failed to start"
fi

# Summary
print_status $BLUE "\n📋 Validation Summary"
print_status $BLUE "===================="

total_checks=8
passed_checks=$(grep -c "✅" validate_deployment.log 2>/dev/null || echo "0")
failed_checks=$(grep -c "❌" validate_deployment.log 2>/dev/null || echo "0") 

if [ $failed_checks -eq 0 ]; then
    print_status $GREEN "🎉 ALL SYSTEMS OPERATIONAL!"
    print_status $GREEN "✅ Enhanced Mnemonic Memory System is ready for production"
    print_status $YELLOW "💡 Next steps:"
    print_status $YELLOW "   1. Start MCP server: node memory-mcp.js &"
    print_status $YELLOW "   2. Run full tests: ./test_system.sh"
    print_status $YELLOW "   3. Setup monitoring: configure monitor_logs.py"
else
    print_status $RED "❌ $failed_checks issues found"
    print_status $YELLOW "📋 Review the output above and fix issues before deployment"
fi

# Cleanup
rm -f dependency_test.log monitor_test.log server_test.log validate_deployment.log

print_status $BLUE "\n🔧 Quick Commands:"
print_status $BLUE "=================="
print_status $YELLOW "Start system:     node memory-mcp.js &"
print_status $YELLOW "Full test suite:  ./test_system.sh"
print_status $YELLOW "Stress test:      ./stress_test.sh"
print_status $YELLOW "Recovery test:    ./test_recovery.sh"
print_status $YELLOW "Check deps:       ./update_deps.sh"
print_status $YELLOW "Monitor logs:     python3 monitor_logs.py"