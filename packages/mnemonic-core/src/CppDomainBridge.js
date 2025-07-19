/**
 * Mnemonic C++ Domain Bridge - Minimal JS wrapper for C++ domain engine
 * This is the primary interface - C++ handles all domain logic
 * NZ-optimised bridge for high-performance memory operations
 */

class CppDomainBridge {
  constructor() {
    this.nativeEngine = null;
    this.initialized = false;
    this.eventHandlers = new Map();
  }

  async initialize(categories = {}) {
    try {
      // Load native C++ engine from workspace
      const MnemonicNativeEngine = require('@mnemonic/native');
      this.nativeEngine = new MnemonicNativeEngine();
      
      // Convert JS categories to C++ format
      const processedCategories = this.processCategories(categories);
      
      this.initialized = this.nativeEngine.initialize(processedCategories);
      
      if (this.initialized) {
        console.log('[CppDomainBridge] C++ domain engine initialized successfully');
      } else {
        console.error('[CppDomainBridge] Failed to initialize C++ domain engine');
      }
      
      return this.initialized;
    } catch (error) {
      console.error('[CppDomainBridge] Error initializing C++ engine:', error.message);
      console.log('[CppDomainBridge] Falling back to JavaScript implementation');
      return false;
    }
  }

  processCategories(categories) {
    // Ensure categories are in the format expected by C++
    const processed = {};
    
    // Default categories if none provided
    const defaults = {
      authentication: ['(intent|callback).*oauth|auth.*fail|token.*invalid'],
      networking: ['http.*timeout|connection.*refused|network.*error'],
      database: ['(db|database).*(fail|connection)|sql.*error'],
      filesystem: ['file.*not.*found|permission.*denied|disk.*full'],
      memory: ['out.*of.*memory|memory.*leak|allocation.*failed'],
      configuration: ['config.*invalid|missing.*env|property.*undefined'],
      api: ['rate.*limit|quota.*exceeded|endpoint.*not.*found'],
      concurrency: ['race.*condition|deadlock|thread.*safety'],
      validation: ['schema.*validation|input.*invalid|type.*mismatch'],
      build: ['compilation.*error|dependency.*missing|version.*conflict']
    };
    
    // Merge with provided categories
    const allCategories = { ...defaults, ...categories };
    
    for (const [name, patterns] of Object.entries(allCategories)) {
      if (Array.isArray(patterns)) {
        processed[name] = patterns;
      } else if (typeof patterns === 'string') {
        processed[name] = [patterns];
      } else {
        processed[name] = [patterns.toString()];
      }
    }
    
    return processed;
  }

  // Core domain operations - delegated to C++
  createMemoryEntry(problem, solution, category) {
    if (!this.ensureInitialized()) return null;
    
    try {
      const entryId = this.nativeEngine.createMemoryEntry(problem, solution, category);
      
      // Emit domain event for JS listeners
      this.emitEvent('MemoryEntryCreated', {
        entryId,
        problem: problem.substring(0, 100) + '...',
        category,
        timestamp: new Date().toISOString()
      });
      
      return entryId;
    } catch (error) {
      console.error('[CppDomainBridge] Error creating memory entry:', error);
      return null;
    }
  }

  updateMemoryEntry(entryId, newSolution, reason) {
    if (!this.ensureInitialized()) return false;
    
    try {
      const success = this.nativeEngine.updateMemoryEntry(entryId, newSolution, reason);
      
      if (success) {
        this.emitEvent('MemoryEntryUpdated', {
          entryId,
          reason,
          timestamp: new Date().toISOString()
        });
      }
      
      return success;
    } catch (error) {
      console.error('[CppDomainBridge] Error updating memory entry:', error);
      return false;
    }
  }

  searchMemories(query, options = {}) {
    if (!this.ensureInitialized()) return [];
    
    try {
      const {
        category = '',
        maxResults = 10
      } = options;
      
      const resultsJson = this.nativeEngine.searchMemories(query, category, maxResults);
      const results = JSON.parse(resultsJson);
      
      // Emit search event
      this.emitEvent('SearchCompleted', {
        query: query.substring(0, 100) + '...',
        resultsCount: Array.isArray(results) ? results.length : 0,
        category,
        timestamp: new Date().toISOString()
      });
      
      return results;
    } catch (error) {
      console.error('[CppDomainBridge] Error searching memories:', error);
      return [];
    }
  }

  getMemoryEntry(entryId) {
    if (!this.ensureInitialized()) return null;
    
    try {
      const entryJson = this.nativeEngine.getMemoryEntry(entryId);
      return JSON.parse(entryJson);
    } catch (error) {
      console.error('[CppDomainBridge] Error getting memory entry:', error);
      return null;
    }
  }

  categorizeError(errorMessage) {
    if (!this.ensureInitialized()) return 'errors_uncategorised';
    
    try {
      return this.nativeEngine.categorizeError(errorMessage);
    } catch (error) {
      console.error('[CppDomainBridge] Error categorizing error:', error);
      return 'errors_uncategorised';
    }
  }

  findSolution(problem, category = '') {
    if (!this.ensureInitialized()) return null;
    
    try {
      const resultJson = this.nativeEngine.findSolution(problem, category);
      return JSON.parse(resultJson);
    } catch (error) {
      console.error('[CppDomainBridge] Error finding solution:', error);
      return null;
    }
  }

  getStatistics() {
    if (!this.ensureInitialized()) return {};
    
    try {
      const statsJson = this.nativeEngine.getStatistics();
      return JSON.parse(statsJson);
    } catch (error) {
      console.error('[CppDomainBridge] Error getting statistics:', error);
      return {};
    }
  }

  // Event system for JS integration
  on(eventType, handler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType).push(handler);
  }

  off(eventType, handler) {
    if (this.eventHandlers.has(eventType)) {
      const handlers = this.eventHandlers.get(eventType);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  emitEvent(eventType, eventData) {
    if (this.eventHandlers.has(eventType)) {
      const handlers = this.eventHandlers.get(eventType);
      handlers.forEach(handler => {
        try {
          handler(eventData);
        } catch (error) {
          console.error(`[CppDomainBridge] Error in event handler for ${eventType}:`, error);
        }
      });
    }
  }

  // Utility methods
  ensureInitialized() {
    if (!this.initialized) {
      console.error('[CppDomainBridge] Engine not initialized. Call initialize() first.');
      return false;
    }
    return true;
  }

  isAvailable() {
    return this.nativeEngine !== null;
  }

  getEngineType() {
    return this.nativeEngine ? 'C++' : 'JavaScript';
  }

  // Health check
  healthCheck() {
    try {
      if (!this.initialized) {
        return {
          status: 'unhealthy',
          message: 'Engine not initialized',
          engineType: 'C++',
          timestamp: new Date().toISOString()
        };
      }

      const stats = this.getStatistics();
      
      return {
        status: 'healthy',
        message: 'C++ domain engine operational',
        engineType: 'C++',
        initialized: this.initialized,
        statistics: stats,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error.message,
        engineType: 'C++',
        timestamp: new Date().toISOString()
      };
    }
  }

  // Bulk operations for performance
  createMemoryEntries(entries) {
    const results = [];
    
    for (const entry of entries) {
      const { problem, solution, category } = entry;
      const entryId = this.createMemoryEntry(problem, solution, category);
      results.push({ entryId, success: entryId !== null });
    }
    
    return results;
  }

  searchMultiple(queries) {
    const results = {};
    
    for (const query of queries) {
      results[query] = this.searchMemories(query);
    }
    
    return results;
  }

  // Performance monitoring
  measureOperation(operationName, operation) {
    const start = Date.now();
    
    try {
      const result = operation();
      const duration = Date.now() - start;
      
      this.emitEvent('OperationMeasured', {
        operationName,
        duration,
        success: true,
        timestamp: new Date().toISOString()
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      
      this.emitEvent('OperationMeasured', {
        operationName,
        duration,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      throw error;
    }
  }
}

module.exports = CppDomainBridge;