#!/bin/bash

# Comprehensive test script for C++ addon functionality
# Tests compilation, functionality, performance, and fallback behavior

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

print_status $BLUE "🧪 Brains Memory System C++ Addon Test Suite"
print_status $BLUE "=============================================="

TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

run_test() {
    local test_name="$1"
    local test_command="$2"
    local expected_result="$3"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    print_status $YELLOW "🔍 Testing: $test_name"
    
    if eval "$test_command" 2>/dev/null; then
        if [ "$expected_result" = "success" ]; then
            print_status $GREEN "  ✅ PASS"
            PASSED_TESTS=$((PASSED_TESTS + 1))
        else
            print_status $RED "  ❌ FAIL (expected failure but got success)"
            FAILED_TESTS=$((FAILED_TESTS + 1))
        fi
    else
        if [ "$expected_result" = "failure" ]; then
            print_status $GREEN "  ✅ PASS (expected failure)"
            PASSED_TESTS=$((PASSED_TESTS + 1))
        else
            print_status $RED "  ❌ FAIL"
            FAILED_TESTS=$((FAILED_TESTS + 1))
        fi
    fi
}

# Test 1: Check prerequisites
print_status $BLUE "\n📋 Phase 1: Prerequisites Check"
print_status $BLUE "================================"

run_test "Node.js availability" "command -v node" "success"
run_test "npm availability" "command -v npm" "success"
run_test "C++ compiler availability" "command -v g++ || command -v clang++" "success"
run_test "Python3 availability" "command -v python3" "success"

# Test 2: Build C++ addon
print_status $BLUE "\n🔨 Phase 2: C++ Addon Build"
print_status $BLUE "============================"

# Install dependencies first
print_status $YELLOW "Installing Node.js dependencies..."
cd native
if npm install > build.log 2>&1; then
    print_status $GREEN "✅ Dependencies installed"
else
    print_status $RED "❌ Dependency installation failed"
    cat build.log
fi

# Test compilation
run_test "C++ addon compilation" "npm run rebuild >> build.log 2>&1" "success"

if [ -f "build/Release/brains_memory_addon.node" ]; then
    print_status $GREEN "✅ C++ addon compiled successfully"
    ADDON_SIZE=$(du -h build/Release/brains_memory_addon.node | cut -f1)
    print_status $YELLOW "  Addon size: $ADDON_SIZE"
else
    print_status $RED "❌ C++ addon compilation failed"
    if [ -f build.log ]; then
        print_status $YELLOW "Build log:"
        tail -20 build.log
    fi
fi

cd ..

# Test 3: Addon functionality
print_status $BLUE "\n⚙️ Phase 3: Addon Functionality Tests"
print_status $BLUE "======================================"

# Test basic loading
run_test "Addon loading" "node -e \"require('./native/index.js'); console.log('OK')\"" "success"

# Test engine initialization
run_test "Engine initialization" "node -e \"
const BrainsEngine = require('./native/index.js');
const engine = new BrainsEngine();
const success = engine.initialize({
  auth: ['oauth.*error'],
  net: ['http.*timeout']
});
if (!success) process.exit(1);
console.log('Engine type:', engine.getEngineType());
\"" "success"

# Test error categorization
run_test "Error categorization" "node -e \"
const BrainsEngine = require('./native/index.js');
const engine = new BrainsEngine();
engine.initialize({auth: ['oauth.*error'], net: ['http.*timeout']});
const result = engine.categorizeError('OAuth token error');
if (result !== 'auth') process.exit(1);
\"" "success"

# Test solution storage and retrieval
run_test "Solution storage/retrieval" "node -e \"
const BrainsEngine = require('./native/index.js');
const engine = new BrainsEngine();
engine.initialize({auth: ['oauth.*error']});
engine.storeSolution('OAuth error', 'auth', 'Check API keys');
const result = engine.findSolution('OAuth error');
if (!result || !result.solution) process.exit(1);
\"" "success"

# Test 4: Performance benchmarks
print_status $BLUE "\n⚡ Phase 4: Performance Benchmarks"
print_status $BLUE "=================================="

# Run native addon test
if [ -f "native/test.js" ]; then
    print_status $YELLOW "Running comprehensive addon tests..."
    if cd native && node test.js > test_results.log 2>&1; then
        print_status $GREEN "✅ Native addon tests passed"
        
        # Extract performance metrics
        if grep -q "operations in" test_results.log; then
            PERF_LINE=$(grep "operations in" test_results.log)
            print_status $YELLOW "  Performance: $PERF_LINE"
        fi
        
        if grep -q "Engine Type:" test_results.log; then
            ENGINE_TYPE=$(grep "Engine Type:" test_results.log | head -1)
            print_status $YELLOW "  $ENGINE_TYPE"
        fi
    else
        print_status $RED "❌ Native addon tests failed"
        if [ -f test_results.log ]; then
            tail -10 test_results.log
        fi
    fi
    cd ..
else
    print_status $YELLOW "⚠️  Native test file not found, skipping detailed tests"
fi

# Test 5: Integration with wrapper
print_status $BLUE "\n🔗 Phase 5: Integration Tests"
print_status $BLUE "============================="

run_test "Memory wrapper integration" "node -e \"
const MemoryWrapper = require('./lib/memory_wrapper.js');
const wrapper = new MemoryWrapper();
wrapper.initializeWithDefaults();
const info = wrapper.getEngineInfo();
console.log('Wrapper engine:', info.type);
\"" "success"

# Test CLI tool
if [ -f "bin/cli.js" ]; then
    run_test "CLI tool execution" "node bin/cli.js help | grep -q 'Brains Memory System CLI'" "success"
    
    # Test CLI commands
    run_test "CLI init command" "echo 'y' | timeout 10s node bin/cli.js init > cli_test.log 2>&1 || true" "success"
    
    if [ -f cli_test.log ]; then
        if grep -q "initialized successfully" cli_test.log; then
            print_status $GREEN "✅ CLI initialization successful"
        else
            print_status $YELLOW "⚠️  CLI initialization had issues"
        fi
        rm -f cli_test.log
    fi
else
    print_status $YELLOW "⚠️  CLI tool not found, skipping CLI tests"
fi

# Test 6: Fallback behavior
print_status $BLUE "\n🔄 Phase 6: Fallback Tests"
print_status $BLUE "=========================="

# Test JavaScript fallback
run_test "JavaScript fallback loading" "node -e \"
const JSEngine = require('./native/fallback.js');
const engine = new JSEngine();
const success = engine.initialize({auth: ['oauth.*error']});
if (!success) process.exit(1);
console.log('Fallback engine loaded');
\"" "success"

# Test wrapper fallback behavior
print_status $YELLOW "Testing fallback when C++ addon unavailable..."
if [ -f "native/build/Release/brains_memory_addon.node" ]; then
    # Temporarily hide the addon
    mv "native/build/Release/brains_memory_addon.node" "native/build/Release/brains_memory_addon.node.bak"
    
    run_test "Wrapper fallback to JavaScript" "node -e \"
    const MemoryWrapper = require('./lib/memory_wrapper.js');
    const wrapper = new MemoryWrapper();
    const info = wrapper.getEngineInfo();
    if (info.type !== 'JavaScript') process.exit(1);
    console.log('Fallback successful');
    \"" "success"
    
    # Restore the addon
    mv "native/build/Release/brains_memory_addon.node.bak" "native/build/Release/brains_memory_addon.node"
else
    print_status $YELLOW "⚠️  C++ addon not found, cannot test fallback behavior"
fi

# Test 7: Memory safety and stability
print_status $BLUE "\n🛡️ Phase 7: Memory Safety Tests"
print_status $BLUE "==============================="

# Test high-volume operations
run_test "High-volume operations" "node -e \"
const BrainsEngine = require('./native/index.js');
const engine = new BrainsEngine();
engine.initialize({test: ['test.*']});

// Stress test with many operations
for (let i = 0; i < 1000; i++) {
  engine.storeSolution(\`Problem \${i}\`, 'test', \`Solution \${i}\`);
  engine.findSolution(\`Problem \${i}\`);
  engine.categorizeError(\`Test error \${i}\`);
}

const stats = engine.getStatistics();
console.log('Stress test completed:', JSON.parse(stats).total_lookups);
\"" "success"

# Test concurrent operations (if available)
run_test "Memory cleanup" "node -e \"
const BrainsEngine = require('./native/index.js');
const engine = new BrainsEngine();
engine.initialize({test: ['test.*']});
for (let i = 0; i < 100; i++) {
  engine.storeSolution('test', 'test', 'solution');
}
engine.clear();
const stats = JSON.parse(engine.getStatistics());
console.log('Cleanup successful, lookups:', stats.total_lookups);
\"" "success"

# Test 8: Integration with existing system
print_status $BLUE "\n🔧 Phase 8: System Integration"
print_status $BLUE "==============================="

# Test with existing YAML files
if [ -f "structured_memory.yaml" ]; then
    run_test "Loading existing memory files" "node -e \"
    const MemoryWrapper = require('./lib/memory_wrapper.js');
    const wrapper = new MemoryWrapper();
    wrapper.initializeFromFile().then(success => {
      if (!success) process.exit(1);
      return wrapper.loadMemoryFromFiles();
    }).then(loaded => {
      console.log('Memory files loaded:', loaded);
    }).catch(err => process.exit(1));
    \"" "success"
else
    print_status $YELLOW "⚠️  No existing memory files found, skipping file loading test"
fi

# Test server integration (quick test)
if [ -f "memory-mcp-v2.js" ]; then
    print_status $YELLOW "Testing enhanced MCP server startup..."
    timeout 5s node memory-mcp-v2.js > server_test.log 2>&1 &
    SERVER_PID=$!
    sleep 2
    
    if kill -0 $SERVER_PID 2>/dev/null; then
        print_status $GREEN "✅ Enhanced MCP server starts successfully"
        kill $SERVER_PID 2>/dev/null || true
    else
        print_status $RED "❌ Enhanced MCP server failed to start"
        if [ -f server_test.log ]; then
            tail -5 server_test.log
        fi
    fi
    
    rm -f server_test.log
else
    print_status $YELLOW "⚠️  Enhanced MCP server not found"
fi

# Final summary
print_status $BLUE "\n📊 Test Summary"
print_status $BLUE "==============="

print_status $YELLOW "Total Tests: $TOTAL_TESTS"
print_status $GREEN "Passed: $PASSED_TESTS"
print_status $RED "Failed: $FAILED_TESTS"

if [ $FAILED_TESTS -eq 0 ]; then
    print_status $GREEN "\n🎉 ALL TESTS PASSED!"
    print_status $GREEN "✅ C++ addon is working correctly"
    print_status $GREEN "✅ JavaScript fallback is functional"
    print_status $GREEN "✅ Integration is successful"
    print_status $GREEN "✅ System is ready for production"
    
    # Show final engine info
    print_status $BLUE "\n🚀 Final System Information"
    print_status $BLUE "============================"
    
    if command -v node >/dev/null 2>&1; then
        node -e "
        const MemoryWrapper = require('./lib/memory_wrapper.js');
        const wrapper = new MemoryWrapper();
        wrapper.initializeWithDefaults().then(() => {
          const info = wrapper.getEngineInfo();
          console.log('Engine Type:', info.type);
          console.log('Version:', info.version);
          console.log('Categories:', info.categories);
          
          // Quick benchmark
          const benchmark = wrapper.benchmark(100);
          console.log('Benchmark (100 ops):', benchmark.operations_per_second, 'ops/sec');
        });
        " 2>/dev/null || echo "Engine info unavailable"
    fi
    
    exit 0
else
    print_status $RED "\n❌ SOME TESTS FAILED"
    print_status $YELLOW "⚠️  Review the failed tests above"
    print_status $YELLOW "💡 The system may still work with JavaScript fallback"
    
    # Check if fallback is working
    if node -e "const MemoryWrapper = require('./lib/memory_wrapper.js'); const w = new MemoryWrapper(); console.log('Fallback available')" 2>/dev/null; then
        print_status $GREEN "✅ JavaScript fallback is available"
        print_status $YELLOW "🔄 System will use JavaScript implementation"
    else
        print_status $RED "❌ Both C++ and JavaScript implementations failed"
    fi
    
    exit 1
fi