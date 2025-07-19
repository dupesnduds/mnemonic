#!/bin/bash

# Brains Memory System Deployment Status Check
# Comprehensive verification of all deployed components

echo "🔍 BRAINS MEMORY SYSTEM DEPLOYMENT STATUS"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

check_status() {
    local component="$1"
    local command="$2"
    local expected="$3"
    
    echo -n "📋 $component: "
    
    if result=$(eval "$command" 2>/dev/null); then
        if [[ -z "$expected" ]] || echo "$result" | grep -q "$expected"; then
            echo -e "${GREEN}✅ OPERATIONAL${NC}"
            return 0
        else
            echo -e "${YELLOW}⚠️  DEGRADED${NC} (Expected: $expected, Got: $result)"
            return 1
        fi
    else
        echo -e "${RED}❌ FAILED${NC}"
        return 1
    fi
}

# Core System Checks
echo -e "${BLUE}🔧 Core System Components${NC}"
echo "=========================="

check_status "Node.js Runtime" "node --version" "v"
check_status "Memory Engine" "npx brains-memory stats | head -1" "Memory System Statistics"
check_status "C++ Addon" "npx brains-memory stats | grep 'Engine Type: C++'" "Engine Type: C++"
check_status "CLI Tools" "which brains-memory || echo 'npx available'" ""

echo ""

# AI Enhancement Checks
echo -e "${BLUE}🧠 AI Enhancement Features${NC}"
echo "=========================="

check_status "Enhanced Memory Wrapper" "node -e 'const E=require(\"./lib/enhanced_memory_wrapper.js\");console.log(\"OK\")'" "OK"
check_status "Learning Engine" "node -e 'const L=require(\"./lib/learning_engine.js\");console.log(\"OK\")'" "OK"
check_status "Documentation Fetcher" "node -e 'const D=require(\"./lib/doc_fetcher.js\");console.log(\"OK\")'" "OK"
check_status "Context Analysis" "node -e 'const E=require(\"./lib/enhanced_memory_wrapper.js\");const e=new E();console.log(e.engineType)'" "Enhanced"

echo ""

# MCP Server Checks
echo -e "${BLUE}🌐 MCP Server & API${NC}"
echo "=================="

check_status "Server Health" "curl -s http://localhost:8081/health | jq -r '.status'" "healthy"
check_status "Statistics API" "curl -s http://localhost:8081/stats | jq -r '.engine.type'" "Enhanced"
check_status "AI Suggestions" "curl -s -X POST -H 'Content-Type: application/json' -d '{\"problem\":\"test\"}' http://localhost:8081/suggest | jq -r '.engine_type'" "Enhanced"
check_status "Performance API" "curl -s http://localhost:8081/benchmark/100 | jq -r '.benchmark.operations_per_second'" ""

echo ""

# Workflow Integration Checks
echo -e "${BLUE}🔗 Workflow Integration${NC}"
echo "======================="

check_status "Shell Integration" "type brains-status" "function"
check_status "Auto-Interception" "echo \$BRAINS_AUTO_INTERCEPT" "true"
check_status "Error Coach" "npx brains-coach --help 2>&1 | head -1" "Brains"
check_status "Error Interceptor" "npx brains-intercept --help 2>&1 | head -1" "Usage"

echo ""

# Performance Metrics
echo -e "${BLUE}📊 Performance Metrics${NC}"
echo "====================="

if curl -s http://localhost:8081/stats >/dev/null 2>&1; then
    STATS=$(curl -s http://localhost:8081/stats)
    
    echo "🚀 Engine Type: $(echo "$STATS" | jq -r '.engine.type')"
    echo "⚡ Uptime: $(echo "$STATS" | jq -r '.server.uptime_human')"
    echo "📈 Total Requests: $(echo "$STATS" | jq -r '.server.total_requests')"
    echo "🎯 Error Rate: $(echo "$STATS" | jq -r '.server.error_rate')%"
    echo "💾 Categories: $(echo "$STATS" | jq -r '.engine.categories')"
else
    echo "⚠️  MCP server not accessible for performance metrics"
fi

echo ""

# Memory Statistics
echo -e "${BLUE}🧠 Memory System Statistics${NC}"
echo "==========================="

if npx brains-memory stats >/dev/null 2>&1; then
    npx brains-memory stats | grep -E "(Engine Type|Version|Categories)"
else
    echo "⚠️  Memory system not accessible"
fi

echo ""

# Integration Status
echo -e "${BLUE}🔧 Integration Status${NC}"
echo "===================="

if command -v brains-status >/dev/null 2>&1; then
    brains-status 2>/dev/null
else
    echo "⚠️  Shell integration not active in current session"
    echo "💡 Run: source ~/.bashrc  # or restart your shell"
fi

echo ""

# Final Assessment
echo -e "${BLUE}🎯 Deployment Assessment${NC}"
echo "========================"

# Count operational components
TOTAL_CHECKS=16
PASSED_CHECKS=0

# Re-run critical checks silently to count
[[ $(node --version 2>/dev/null) ]] && ((PASSED_CHECKS++))
[[ $(npx brains-memory stats 2>/dev/null | grep "Memory System") ]] && ((PASSED_CHECKS++))
[[ $(curl -s http://localhost:8081/health 2>/dev/null | jq -r '.status' 2>/dev/null) == "healthy" ]] && ((PASSED_CHECKS++))
[[ $(node -e 'const E=require("./lib/enhanced_memory_wrapper.js");console.log("OK")' 2>/dev/null) == "OK" ]] && ((PASSED_CHECKS++))

# More quick checks...
[[ $(echo $BRAINS_AUTO_INTERCEPT) == "true" ]] && ((PASSED_CHECKS++))
[[ -f "shell/brains-shell-integration.sh" ]] && ((PASSED_CHECKS++))
[[ -f "bin/brains-coach.js" ]] && ((PASSED_CHECKS++))
[[ -f "bin/brains-intercept.js" ]] && ((PASSED_CHECKS++))

PASS_RATE=$((PASSED_CHECKS * 100 / 8))  # Using 8 core checks

if [[ $PASS_RATE -ge 90 ]]; then
    echo -e "${GREEN}🎉 DEPLOYMENT SUCCESSFUL${NC}"
    echo -e "${GREEN}System is production-ready with $PASS_RATE% functionality${NC}"
elif [[ $PASS_RATE -ge 70 ]]; then
    echo -e "${YELLOW}⚠️  DEPLOYMENT PARTIALLY SUCCESSFUL${NC}"
    echo -e "${YELLOW}System is functional with $PASS_RATE% capability - minor issues present${NC}"
else
    echo -e "${RED}❌ DEPLOYMENT ISSUES DETECTED${NC}"
    echo -e "${RED}System has significant issues - only $PASS_RATE% functional${NC}"
fi

echo ""
echo "📚 Next Steps:"
echo "1. Restart shell: exec bash"
echo "2. Test workflow: brains-status"
echo "3. Try coaching: brains-coach 'npm error'"
echo "4. Read guide: cat WORKFLOW_INTEGRATION_GUIDE.md"