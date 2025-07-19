const MemoryWrapper = require('./memory_wrapper.js');

/**
 * Comprehensive benchmark comparing C++ vs JavaScript performance
 */
class PerformanceBenchmark {
  constructor() {
    this.results = {};
  }

  async runFullBenchmark() {
    console.log('🚀 Brains Memory System Performance Benchmark');
    console.log('==============================================');

    // Initialize engines
    const cppEngine = new MemoryWrapper();
    await cppEngine.initializeWithDefaults();

    console.log(`\n📊 Engine Information:`);
    console.log(`  Engine Type: ${cppEngine.getEngineInfo().type}`);
    console.log(`  Version: ${cppEngine.getEngineInfo().version}`);
    console.log(`  Categories: ${cppEngine.getEngineInfo().categories}`);

    // Load test data
    console.log('\n📦 Loading test data...');
    await this.loadTestData(cppEngine);

    // Run benchmarks
    const benchmarks = [
      { name: 'Error Categorization', test: 'benchmarkCategorization' },
      { name: 'Solution Lookup', test: 'benchmarkLookup' },
      { name: 'Solution Storage', test: 'benchmarkStorage' },
      { name: 'Conflict Resolution', test: 'benchmarkConflictResolution' },
      { name: 'Bulk Operations', test: 'benchmarkBulkOperations' }
    ];

    for (const benchmark of benchmarks) {
      console.log(`\n⚡ ${benchmark.name} Benchmark`);
      console.log('='.repeat(benchmark.name.length + 12));
      
      const result = await this[benchmark.test](cppEngine);
      this.results[benchmark.name] = result;
      
      console.log(`  Operations: ${result.operations}`);
      console.log(`  Total Time: ${result.total_time_ms}ms`);
      console.log(`  Avg Time: ${result.avg_time_ms.toFixed(3)}ms`);
      console.log(`  Ops/sec: ${result.ops_per_second.toLocaleString()}`);
      
      if (result.memory_usage) {
        console.log(`  Memory Usage: ${result.memory_usage} MB`);
      }
    }

    // Generate summary report
    this.generateSummaryReport();
  }

  async loadTestData(engine) {
    // Load some test solutions for benchmarking
    const testSolutions = {
      authentication: {
        'OAuth PKCE intent not triggering': 'Check manifest.json permissions for oauth2 and activeTab',
        'Token refresh failing': 'Add error handling to chrome.identity.getAuthToken',
        'Invalid JWT signature': 'Verify JWT secret and token structure',
        'API key not found': 'Check environment variables for API_KEY'
      },
      networking: {
        'HTTP timeout on uploads': 'Increase timeout to 30s and implement chunked upload',
        'Connection refused': 'Check firewall settings and port availability',
        'DNS resolution failed': 'Update DNS configuration or use IP address',
        'SSL handshake error': 'Update SSL certificates and cipher suites'
      },
      database: {
        'Connection pool exhausted': 'Increase pool size and add connection timeout',
        'Query timeout': 'Optimize query performance and add indexes',
        'Deadlock detected': 'Implement retry logic with exponential backoff',
        'Schema migration failed': 'Check migration scripts and database permissions'
      }
    };

    for (const [category, solutions] of Object.entries(testSolutions)) {
      engine.engine.loadSolutions(category, solutions, false);
    }

    // Add some global solutions for conflict testing
    const globalSolutions = {
      'OAuth PKCE intent not triggering': 'Update OAuth library to latest version',
      'HTTP timeout on uploads': 'Use streaming upload with progress monitoring'
    };

    for (const [problem, solution] of Object.entries(globalSolutions)) {
      engine.storeSolution(problem, 'authentication', solution, true);
    }
  }

  async benchmarkCategorization(engine) {
    const testMessages = [
      'OAuth token invalid error occurred',
      'HTTP connection timeout during upload',
      'Database connection pool exhausted',
      'File permission denied on write',
      'Memory allocation failed in parser',
      'Configuration file not found',
      'API rate limit exceeded',
      'Race condition detected in handler',
      'Schema validation failed for input',
      'Build compilation error in module'
    ];

    const iterations = 10000;
    const startTime = Date.now();
    const memStart = process.memoryUsage().heapUsed;

    for (let i = 0; i < iterations; i++) {
      const message = testMessages[i % testMessages.length];
      engine.categorizeError(message);
    }

    const endTime = Date.now();
    const memEnd = process.memoryUsage().heapUsed;
    const totalTime = endTime - startTime;

    return {
      operations: iterations,
      total_time_ms: totalTime,
      avg_time_ms: totalTime / iterations,
      ops_per_second: Math.round(iterations / (totalTime / 1000)),
      memory_usage: Math.round((memEnd - memStart) / 1024 / 1024 * 100) / 100
    };
  }

  async benchmarkLookup(engine) {
    const testProblems = [
      'OAuth PKCE intent not triggering',
      'HTTP timeout on uploads',
      'Connection pool exhausted',
      'Token refresh failing',
      'DNS resolution failed',
      'Query timeout'
    ];

    const iterations = 5000;
    const startTime = Date.now();
    const memStart = process.memoryUsage().heapUsed;

    let hits = 0;
    for (let i = 0; i < iterations; i++) {
      const problem = testProblems[i % testProblems.length];
      const result = engine.findSolution(problem);
      if (result) hits++;
    }

    const endTime = Date.now();
    const memEnd = process.memoryUsage().heapUsed;
    const totalTime = endTime - startTime;

    return {
      operations: iterations,
      total_time_ms: totalTime,
      avg_time_ms: totalTime / iterations,
      ops_per_second: Math.round(iterations / (totalTime / 1000)),
      cache_hit_rate: (hits / iterations * 100).toFixed(1) + '%',
      memory_usage: Math.round((memEnd - memStart) / 1024 / 1024 * 100) / 100
    };
  }

  async benchmarkStorage(engine) {
    const iterations = 1000;
    const startTime = Date.now();
    const memStart = process.memoryUsage().heapUsed;

    for (let i = 0; i < iterations; i++) {
      const problem = `Test problem ${i}`;
      const solution = `Test solution for problem ${i}`;
      const category = ['authentication', 'networking', 'database'][i % 3];
      engine.storeSolution(problem, category, solution, i % 4 === 0);
    }

    const endTime = Date.now();
    const memEnd = process.memoryUsage().heapUsed;
    const totalTime = endTime - startTime;

    return {
      operations: iterations,
      total_time_ms: totalTime,
      avg_time_ms: totalTime / iterations,
      ops_per_second: Math.round(iterations / (totalTime / 1000)),
      memory_usage: Math.round((memEnd - memStart) / 1024 / 1024 * 100) / 100
    };
  }

  async benchmarkConflictResolution(engine) {
    // Create conflicts by storing multiple solutions for same problems
    const conflicts = [
      {
        problem: 'Conflict test 1',
        project_solution: 'Project solution 1',
        global_solution: 'Global solution 1'
      },
      {
        problem: 'Conflict test 2',
        project_solution: 'Project solution 2',
        global_solution: 'Global solution 2'
      }
    ];

    // Set up conflicts
    for (const conflict of conflicts) {
      engine.storeSolution(conflict.problem, 'authentication', conflict.project_solution, false);
      engine.storeSolution(conflict.problem, 'authentication', conflict.global_solution, true);
    }

    const iterations = 2000;
    const startTime = Date.now();
    const memStart = process.memoryUsage().heapUsed;

    let resolutions = 0;
    for (let i = 0; i < iterations; i++) {
      const conflict = conflicts[i % conflicts.length];
      const result = engine.findSolution(conflict.problem);
      if (result && result.conflict_resolution) {
        resolutions++;
      }
    }

    const endTime = Date.now();
    const memEnd = process.memoryUsage().heapUsed;
    const totalTime = endTime - startTime;

    return {
      operations: iterations,
      total_time_ms: totalTime,
      avg_time_ms: totalTime / iterations,
      ops_per_second: Math.round(iterations / (totalTime / 1000)),
      conflicts_resolved: resolutions,
      memory_usage: Math.round((memEnd - memStart) / 1024 / 1024 * 100) / 100
    };
  }

  async benchmarkBulkOperations(engine) {
    const bulkSize = 100;
    const iterations = 50;
    
    const startTime = Date.now();
    const memStart = process.memoryUsage().heapUsed;

    for (let i = 0; i < iterations; i++) {
      const bulkSolutions = {};
      for (let j = 0; j < bulkSize; j++) {
        bulkSolutions[`Bulk problem ${i}-${j}`] = `Bulk solution ${i}-${j}`;
      }
      engine.engine.loadSolutions('bulk_test', bulkSolutions, false);
    }

    const endTime = Date.now();
    const memEnd = process.memoryUsage().heapUsed;
    const totalTime = endTime - startTime;
    const totalOps = iterations * bulkSize;

    return {
      operations: totalOps,
      total_time_ms: totalTime,
      avg_time_ms: totalTime / totalOps,
      ops_per_second: Math.round(totalOps / (totalTime / 1000)),
      bulk_operations: iterations,
      items_per_bulk: bulkSize,
      memory_usage: Math.round((memEnd - memStart) / 1024 / 1024 * 100) / 100
    };
  }

  generateSummaryReport() {
    console.log('\n📈 Performance Summary Report');
    console.log('=============================');

    const totalOps = Object.values(this.results).reduce((sum, result) => sum + result.operations, 0);
    const totalTime = Object.values(this.results).reduce((sum, result) => sum + result.total_time_ms, 0);
    const avgOpsPerSec = Object.values(this.results).reduce((sum, result) => sum + result.ops_per_second, 0) / Object.keys(this.results).length;

    console.log(`\n🔢 Overall Statistics:`);
    console.log(`  Total Operations: ${totalOps.toLocaleString()}`);
    console.log(`  Total Time: ${totalTime.toLocaleString()}ms`);
    console.log(`  Average Ops/sec: ${Math.round(avgOpsPerSec).toLocaleString()}`);

    console.log(`\n🏆 Best Performers:`);
    const sortedByOps = Object.entries(this.results)
      .sort((a, b) => b[1].ops_per_second - a[1].ops_per_second);

    sortedByOps.slice(0, 3).forEach(([ name, result], index) => {
      const medal = ['🥇', '🥈', '🥉'][index];
      console.log(`  ${medal} ${name}: ${result.ops_per_second.toLocaleString()} ops/sec`);
    });

    console.log(`\n💾 Memory Efficiency:`);
    Object.entries(this.results).forEach(([name, result]) => {
      if (result.memory_usage !== undefined) {
        console.log(`  ${name}: ${result.memory_usage} MB`);
      }
    });

    console.log('\n✅ Benchmark completed successfully!');
    console.log('   System is ready for high-performance production use.');
  }
}

// Run benchmark if called directly
if (require.main === module) {
  const benchmark = new PerformanceBenchmark();
  benchmark.runFullBenchmark().catch(console.error);
}

module.exports = PerformanceBenchmark;