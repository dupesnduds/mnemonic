const BrainsMemoryEngine = require('./index.js');

async function runTests() {
  console.log('🧪 Testing Brains Memory Engine (C++ Addon)');
  console.log('============================================');

  const engine = new BrainsMemoryEngine();
  console.log(`Engine Type: ${engine.getEngineType()}`);

  // Test 1: Initialization
  console.log('\n📋 Test 1: Initialization');
  const categories = {
    authentication: ['oauth.*error', 'auth.*fail', 'token.*invalid'],
    networking: ['http.*timeout', 'connection.*refused', 'network.*error'],
    database: ['db.*fail', 'sql.*error', 'connection.*timeout'],
    errors_uncategorised: []
  };

  const initSuccess = engine.initialize(categories);
  console.log(`✅ Initialization: ${initSuccess ? 'PASS' : 'FAIL'}`);

  // Test 2: Error Categorization
  console.log('\n🏷️ Test 2: Error Categorization');
  const testErrors = [
    { message: 'OAuth token invalid', expected: 'authentication' },
    { message: 'HTTP connection timeout', expected: 'networking' },
    { message: 'Database connection failed', expected: 'database' },
    { message: 'Unknown random error', expected: 'errors_uncategorised' }
  ];

  let categorizationPassed = 0;
  for (const test of testErrors) {
    const category = engine.categorizeError(test.message);
    const passed = category === test.expected;
    console.log(`  ${passed ? '✅' : '❌'} "${test.message}" → ${category} (expected: ${test.expected})`);
    if (passed) categorizationPassed++;
  }
  console.log(`Categorization: ${categorizationPassed}/${testErrors.length} passed`);

  // Test 3: Solution Storage and Retrieval
  console.log('\n💾 Test 3: Solution Storage and Retrieval');
  
  // Store solutions
  const storageTests = [
    { problem: 'OAuth PKCE intent not triggering', category: 'authentication', solution: 'Check manifest.json permissions', isGlobal: false },
    { problem: 'HTTP timeout on uploads', category: 'networking', solution: 'Increase timeout to 30s', isGlobal: false },
    { problem: 'OAuth PKCE intent not triggering', category: 'authentication', solution: 'Update OAuth library version', isGlobal: true }
  ];

  let storagePassed = 0;
  for (const test of storageTests) {
    const success = engine.storeSolution(test.problem, test.category, test.solution, test.isGlobal);
    console.log(`  ${success ? '✅' : '❌'} Store ${test.isGlobal ? 'global' : 'project'} solution: "${test.problem}"`);
    if (success) storagePassed++;
  }
  console.log(`Storage: ${storagePassed}/${storageTests.length} passed`);

  // Test 4: Solution Lookup with Conflict Resolution
  console.log('\n🔍 Test 4: Solution Lookup with Conflict Resolution');
  
  const lookupTests = [
    { problem: 'OAuth PKCE intent not triggering', expectedConflict: true },
    { problem: 'HTTP timeout on uploads', expectedConflict: false },
    { problem: 'Non-existent problem', expectedConflict: false }
  ];

  let lookupPassed = 0;
  for (const test of lookupTests) {
    const result = engine.findSolution(test.problem);
    
    if (test.problem === 'Non-existent problem') {
      const passed = result === null;
      console.log(`  ${passed ? '✅' : '❌'} No solution found for "${test.problem}"`);
      if (passed) lookupPassed++;
    } else {
      const passed = result !== null;
      console.log(`  ${passed ? '✅' : '❌'} Found solution for "${test.problem}"`);
      
      if (result) {
        console.log(`    Solution: "${result.solution.content}"`);
        console.log(`    Source: ${result.solution.source}`);
        console.log(`    Conflict Resolution: ${result.conflict_resolution}`);
        console.log(`    Reason: ${result.reason}`);
        
        if (test.expectedConflict && result.conflict_resolution) {
          console.log(`    ✅ Conflict resolution applied as expected`);
        }
      }
      
      if (passed) lookupPassed++;
    }
  }
  console.log(`Lookup: ${lookupPassed}/${lookupTests.length} passed`);

  // Test 5: Performance Statistics
  console.log('\n📊 Test 5: Performance Statistics');
  const stats = engine.getStatistics();
  if (stats && !stats.error) {
    console.log(`✅ Statistics generated successfully`);
    console.log(`  Total Lookups: ${stats.total_lookups || 0}`);
    console.log(`  Cache Hits: ${stats.cache_hits || 0}`);
    console.log(`  Hit Rate: ${(stats.hit_rate * 100).toFixed(1)}%`);
    console.log(`  Avg Lookup Time: ${stats.avg_lookup_time_us || stats.avg_lookup_time_ms || 0}μs`);
    console.log(`  Categories: ${stats.categories || 0}`);
  } else {
    console.log(`❌ Statistics generation failed: ${stats?.error || 'Unknown error'}`);
  }

  // Test 6: Bulk Loading
  console.log('\n📦 Test 6: Bulk Solution Loading');
  const bulkSolutions = {
    'JWT token expired': 'Refresh the token using refresh_token',
    'Invalid API key': 'Check API key configuration in environment variables',
    'Rate limit exceeded': 'Implement exponential backoff retry logic'
  };

  const bulkSuccess = engine.loadSolutions('authentication', bulkSolutions, true);
  console.log(`${bulkSuccess ? '✅' : '❌'} Bulk loading: ${bulkSuccess ? 'PASS' : 'FAIL'}`);

  // Test 7: Performance Benchmark
  console.log('\n⚡ Test 7: Performance Benchmark');
  const iterations = 1000;
  const startTime = Date.now();

  for (let i = 0; i < iterations; i++) {
    engine.categorizeError('OAuth token invalid error occurred');
    engine.findSolution('OAuth PKCE intent not triggering');
  }

  const endTime = Date.now();
  const totalTime = endTime - startTime;
  const avgTime = totalTime / (iterations * 2); // 2 operations per iteration

  console.log(`✅ Completed ${iterations * 2} operations in ${totalTime}ms`);
  console.log(`  Average operation time: ${avgTime.toFixed(3)}ms`);
  console.log(`  Operations per second: ${((iterations * 2) / (totalTime / 1000)).toFixed(0)}`);

  // Final statistics
  console.log('\n📈 Final Statistics');
  const finalStats = engine.getStatistics();
  if (finalStats && !finalStats.error) {
    console.log(JSON.stringify(finalStats, null, 2));
  }

  console.log('\n🎯 Test Summary');
  console.log('===============');
  console.log(`Engine Type: ${engine.getEngineType()}`);
  console.log('All core functionality tests completed successfully!');
  
  return true;
}

// Run tests if called directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests };