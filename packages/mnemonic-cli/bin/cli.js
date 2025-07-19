#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const MemoryWrapper = require('../lib/memory_wrapper.js');

/**
 * Command Line Interface for Brains Memory System
 */
class BrainsCLI {
  constructor() {
    this.engine = null;
    this.commands = {
      init: this.initCommand.bind(this),
      store: this.storeCommand.bind(this),
      find: this.findCommand.bind(this),
      categorize: this.categorizeCommand.bind(this),
      stats: this.statsCommand.bind(this),
      benchmark: this.benchmarkCommand.bind(this),
      clear: this.clearCommand.bind(this),
      solve: this.solveCommand.bind(this),
      help: this.helpCommand.bind(this)
    };
  }

  async run() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
      this.helpCommand();
      return;
    }

    const command = args[0];
    const commandArgs = args.slice(1);

    if (!this.commands[command]) {
      console.error(`❌ Unknown command: ${command}`);
      this.helpCommand();
      process.exit(1);
    }

    try {
      await this.commands[command](commandArgs);
    } catch (error) {
      console.error(`❌ Error executing command '${command}':`, error.message);
      process.exit(1);
    }
  }

  async ensureInitialized() {
    if (!this.engine) {
      this.engine = new MemoryWrapper();
      const success = await this.engine.initializeFromFile();
      if (!success) {
        throw new Error('Failed to initialize memory engine');
      }
      
      // Try to load existing memory files
      await this.engine.loadMemoryFromFiles();
    }
  }

  async initCommand(args) {
    console.log('🧠 Initializing Brains Memory System...');
    
    const engine = new MemoryWrapper();
    const success = await engine.initializeFromFile();
    
    if (success) {
      console.log('✅ Memory engine initialized successfully');
      const info = engine.getEngineInfo();
      console.log(`   Engine Type: ${info.type}`);
      console.log(`   Version: ${info.version}`);
      console.log(`   Categories: ${info.categories}`);
      
      // Load existing memory if available
      const loaded = await engine.loadMemoryFromFiles();
      if (loaded) {
        console.log('📦 Existing memory data loaded');
      }
      
      console.log('\n💡 Try these commands:');
      console.log('   brains-memory find "OAuth error"');
      console.log('   brains-memory store "My problem" "authentication" "My solution"');
      console.log('   brains-memory stats');
    } else {
      console.error('❌ Failed to initialize memory engine');
      process.exit(1);
    }
  }

  async storeCommand(args) {
    if (args.length < 3) {
      console.error('❌ Usage: brains-memory store <problem> <category> <solution> [--global]');
      console.error('   Example: brains-memory store "OAuth error" "authentication" "Check API keys"');
      return;
    }

    await this.ensureInitialized();

    const [problem, category, solution] = args;
    const isGlobal = args.includes('--global');

    const success = this.engine.storeSolution(problem, category, solution, isGlobal);
    
    if (success) {
      console.log(`✅ Solution stored successfully`);
      console.log(`   Problem: ${problem}`);
      console.log(`   Category: ${category}`);
      console.log(`   Scope: ${isGlobal ? 'Global' : 'Project'}`);
    } else {
      console.error('❌ Failed to store solution');
    }
  }

  async findCommand(args) {
    if (args.length < 1) {
      console.error('❌ Usage: brains-memory find <problem> [category]');
      console.error('   Example: brains-memory find "OAuth error"');
      return;
    }

    await this.ensureInitialized();

    const [problem, category] = args;
    const result = this.engine.findSolution(problem, category);

    if (result && result.found) {
      console.log(`✅ Solution found:`);
      console.log(`   Problem: ${problem}`);
      console.log(`   Category: ${result.category}`);
      console.log(`   Solution: ${result.solution.content}`);
      console.log(`   Source: ${result.source}`);
      console.log(`   Created: ${result.solution.created_date}`);
      console.log(`   Use Count: ${result.solution.use_count}`);
      
      if (result.conflict_resolution) {
        console.log(`   Conflict Resolution: ${result.conflict_resolution}`);
        console.log(`   Reason: ${result.reason}`);
      }
    } else {
      console.log(`❌ No solution found for: ${problem}`);
      
      // Suggest category
      const suggestedCategory = this.engine.categorizeError(problem);
      console.log(`💡 Suggested category: ${suggestedCategory}`);
      console.log(`   Try: brains-memory store "${problem}" "${suggestedCategory}" "Your solution"`);
    }
  }

  async categorizeCommand(args) {
    if (args.length < 1) {
      console.error('❌ Usage: brains-memory categorize <error_message>');
      console.error('   Example: brains-memory categorize "OAuth token invalid"');
      return;
    }

    await this.ensureInitialized();

    const errorMessage = args.join(' ');
    const category = this.engine.categorizeError(errorMessage);

    console.log(`📝 Error categorization:`);
    console.log(`   Message: ${errorMessage}`);
    console.log(`   Category: ${category}`);
  }

  async statsCommand(args) {
    await this.ensureInitialized();

    const stats = this.engine.getStatistics();
    const info = this.engine.getEngineInfo();

    console.log('📊 Memory System Statistics');
    console.log('===========================');
    console.log(`Engine Type: ${info.type}`);
    console.log(`Version: ${info.version}`);
    console.log(`Initialized: ${info.initialized}`);
    
    if (stats && !stats.error) {
      console.log(`\nPerformance:`);
      console.log(`  Total Lookups: ${stats.total_lookups || 0}`);
      console.log(`  Cache Hits: ${stats.cache_hits || 0}`);
      console.log(`  Hit Rate: ${((stats.hit_rate || 0) * 100).toFixed(1)}%`);
      console.log(`  Avg Lookup Time: ${stats.avg_lookup_time_us || stats.avg_lookup_time_ms || 0}μs`);
      
      console.log(`\nMemory Content:`);
      console.log(`  Categories: ${stats.categories || 0}`);
      
      if (stats.category_breakdown) {
        for (const [category, counts] of Object.entries(stats.category_breakdown)) {
          console.log(`    ${category}: ${counts.project} project + ${counts.global} global solutions`);
        }
      }
    } else {
      console.log(`Error: ${stats?.error || 'Failed to get statistics'}`);
    }
  }

  async benchmarkCommand(args) {
    console.log('🚀 Running performance benchmark...');
    
    await this.ensureInitialized();
    
    const iterations = args[0] ? parseInt(args[0]) : 1000;
    const result = this.engine.benchmark(iterations);
    
    if (result.error) {
      console.error(`❌ Benchmark failed: ${result.error}`);
      return;
    }

    console.log('⚡ Benchmark Results');
    console.log('===================');
    console.log(`Engine Type: ${result.engine_type}`);
    console.log(`Operations: ${result.iterations}`);
    console.log(`Total Time: ${result.total_time_ms}ms`);
    console.log(`Avg Time: ${result.avg_operation_time_ms.toFixed(3)}ms`);
    console.log(`Ops/second: ${result.operations_per_second.toLocaleString()}`);
  }

  async clearCommand(args) {
    await this.ensureInitialized();
    
    const confirm = args.includes('--force') || args.includes('-f');
    
    if (!confirm) {
      console.log('⚠️  This will clear all cached memory data.');
      console.log('   Use --force to confirm: brains-memory clear --force');
      return;
    }

    this.engine.clear();
    console.log('✅ Memory cache cleared successfully');
  }

  async solveCommand(args) {
    if (args.length < 1) {
      console.error('❌ Usage: brains-memory solve <problem_description>');
      console.error('   Example: brains-memory solve "React component not rendering"');
      return;
    }

    const problem = args.join(' ');
    
    await this.ensureInitialized();

    // First check if we have a solution in memory
    const result = this.engine.findSolution(problem);
    
    if (result && result.found) {
      console.log(`✅ Solution found in memory:`);
      console.log(`   Problem: ${problem}`);
      console.log(`   Category: ${result.category}`);
      console.log(`   Solution: ${result.solution.content}`);
      console.log(`   Source: ${result.source}`);
      console.log(`   Created: ${result.solution.created_date}`);
      console.log(`   Use Count: ${result.solution.use_count}`);
      return;
    }

    // If no solution found, suggest what to do
    console.log(`❌ No solution found for: ${problem}`);
    
    const suggestedCategory = this.engine.categorizeError(problem);
    console.log(`💡 Suggested category: ${suggestedCategory}`);
    console.log('');
    console.log('🤖 For AI-powered solutions, try:');
    console.log(`   brains-claude solve "${problem}"`);
    console.log('');
    console.log('📝 Or if you have a solution, store it:');
    console.log(`   brains-memory store "${problem}" "${suggestedCategory}" "Your solution"`);
  }

  helpCommand() {
    console.log('🧠 Brains Memory System CLI');
    console.log('===========================');
    console.log('');
    console.log('Commands:');
    console.log('  init                           Initialize the memory system');
    console.log('  store <problem> <category> <solution> [--global]  Store a solution');
    console.log('  find <problem> [category]      Find a solution for a problem');
    console.log('  solve <problem>                Find solution or suggest next steps');
    console.log('  categorize <error_message>     Categorize an error message');
    console.log('  stats                          Show system statistics');
    console.log('  benchmark [iterations]         Run performance benchmark');
    console.log('  clear [--force]               Clear memory cache');
    console.log('  help                          Show this help message');
    console.log('');
    console.log('Examples:');
    console.log('  brains-memory init');
    console.log('  brains-memory store "OAuth error" "authentication" "Check API keys"');
    console.log('  brains-memory find "HTTP timeout"');
    console.log('  brains-memory solve "React component not rendering"');
    console.log('  brains-memory categorize "Database connection failed"');
    console.log('  brains-memory stats');
    console.log('  brains-memory benchmark 5000');
  }
}

// Run CLI if called directly
if (require.main === module) {
  const cli = new BrainsCLI();
  cli.run().catch(error => {
    console.error('❌ CLI Error:', error.message);
    process.exit(1);
  });
}

module.exports = BrainsCLI;