/**
 * CLI Integration for Enhanced Brains Memory System
 * Connects the layered retrieval system to the CLI commands
 */

const LayeredRetrieval = require('./layered_retrieval');
const MemoryWrapper = require('./memory_wrapper');

class CLIIntegration {
  constructor() {
    this.layeredRetrieval = new LayeredRetrieval();
    this.memory = new MemoryWrapper();
    this.isInitialized = false;
  }

  /**
   * Initialize the CLI integration
   */
  async initialize() {
    try {
      // Initialize memory wrapper
      await this.memory.initializeWithDefaults();
      await this.memory.loadMemoryFromFiles();
      
      this.isInitialized = true;
      console.log('✅ Enhanced Brains Memory System initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize enhanced system:', error.message);
      return false;
    }
  }

  /**
   * Enhanced search with layered retrieval
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Search result
   */
  async search(query, options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const result = await this.layeredRetrieval.search(query, options);
      
      if (result.success) {
        console.log(`\n🎯 Found solution (${Math.round(result.confidence * 100)}% confidence):`);
        console.log(`   ${result.solution}`);
        
        if (result.conflicts_detected && result.conflicts_detected.length > 0) {
          console.log(`\n⚠️  Conflicts detected: ${result.conflicts_detected.length}`);
        }
        
        console.log(`\n📊 Search completed:`);
        console.log(`   - Layers used: ${result.search_metadata.layers_used}`);
        console.log(`   - External calls: ${result.search_metadata.external_calls_made}`);
        console.log(`   - Duration: ${result.search_metadata.duration_ms}ms`);
        console.log(`   - Termination: ${result.termination_reason}`);
        
        return result;
      } else {
        console.log(`❌ Search failed: ${result.error}`);
        return result;
      }
    } catch (error) {
      console.error(`❌ Enhanced search failed: ${error.message}`);
      
      // Fallback to basic memory search
      console.log('🔄 Falling back to basic memory search...');
      return await this.basicMemorySearch(query, options);
    }
  }

  /**
   * Basic memory search fallback
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Object} Basic search result
   */
  async basicMemorySearch(query, options = {}) {
    const memoryResult = this.memory.findSolution(query, options.category);
    
    if (memoryResult && memoryResult.found && memoryResult.solutions.length > 0) {
      const solution = memoryResult.solutions[0];
      console.log(`\n🧠 Memory result (${Math.round(memoryResult.confidence * 100)}% confidence):`);
      console.log(`   ${solution.solution}`);
      
      return {
        query: query,
        success: true,
        confidence: memoryResult.confidence,
        solution: solution.solution,
        source: 'memory_fallback',
        search_metadata: {
          timestamp: new Date().toISOString(),
          layers_used: 1,
          external_calls_made: 0,
          fallback_used: true
        }
      };
    } else {
      console.log('❌ No solutions found in memory');
      return {
        query: query,
        success: false,
        error: 'No solutions found',
        search_metadata: {
          timestamp: new Date().toISOString(),
          fallback_used: true
        }
      };
    }
  }

  /**
   * Store solution using enhanced system
   * @param {string} problem - Problem description
   * @param {string} solution - Solution content
   * @param {string} category - Problem category
   * @returns {boolean} Success status
   */
  async store(problem, solution, category = 'general') {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const success = this.memory.storeSolution(problem, category, solution, false);
    
    if (success) {
      console.log(`✅ Solution stored in category: ${category}`);
      console.log(`   Problem: ${problem}`);
      console.log(`   Solution: ${solution}`);
    } else {
      console.log(`❌ Failed to store solution`);
    }
    
    return success;
  }

  /**
   * Get system status
   * @returns {Object} System status
   */
  async getStatus() {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      return await this.layeredRetrieval.getSystemStatus();
    } catch (error) {
      console.error('Failed to get system status:', error.message);
      return {
        error: error.message,
        basic_status: this.memory.getEngineInfo()
      };
    }
  }

  /**
   * Show detailed search statistics
   * @returns {Object} Search statistics
   */
  async getStats() {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const systemStatus = await this.getStatus();
    const memoryStats = this.memory.getStatistics();
    
    return {
      system: systemStatus,
      memory: memoryStats,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Test the enhanced system
   * @returns {Object} Test results
   */
  async test() {
    console.log('🧪 Testing Enhanced Brains Memory System...');
    
    const testResults = {
      initialization: false,
      memory_search: false,
      layered_search: false,
      storage: false,
      system_status: false
    };

    try {
      // Test initialization
      testResults.initialization = await this.initialize();
      console.log(`   Initialization: ${testResults.initialization ? '✅' : '❌'}`);

      // Test memory search
      const memoryResult = this.memory.findSolution('test problem', 'general');
      testResults.memory_search = memoryResult !== null;
      console.log(`   Memory search: ${testResults.memory_search ? '✅' : '❌'}`);

      // Test storage
      testResults.storage = await this.store('test deployment validation', 'System deployment validation successful', 'validation');
      console.log(`   Storage: ${testResults.storage ? '✅' : '❌'}`);

      // Test layered search
      try {
        const layeredResult = await this.layeredRetrieval.search('test deployment validation', {
          maxLayers: 1,
          allowGitHub: false,
          allowDocs: false
        });
        testResults.layered_search = layeredResult.success;
        console.log(`   Layered search: ${testResults.layered_search ? '✅' : '❌'}`);
      } catch (error) {
        console.log(`   Layered search: ❌ (${error.message})`);
      }

      // Test system status
      try {
        const status = await this.getStatus();
        testResults.system_status = status && !status.error;
        console.log(`   System status: ${testResults.system_status ? '✅' : '❌'}`);
      } catch (error) {
        console.log(`   System status: ❌ (${error.message})`);
      }

      const passedTests = Object.values(testResults).filter(Boolean).length;
      const totalTests = Object.keys(testResults).length;
      
      console.log(`\n📊 Test Results: ${passedTests}/${totalTests} passed`);
      
      return {
        passed: passedTests,
        total: totalTests,
        success_rate: passedTests / totalTests,
        details: testResults
      };

    } catch (error) {
      console.error('❌ Test failed:', error.message);
      return {
        passed: 0,
        total: Object.keys(testResults).length,
        success_rate: 0,
        error: error.message,
        details: testResults
      };
    }
  }
}

module.exports = CLIIntegration;