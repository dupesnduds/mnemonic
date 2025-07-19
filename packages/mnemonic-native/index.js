const path = require('path');

let MemoryEngine;
let EnhancedMemoryEngine;

try {
  // Try to load the compiled addon
  const addon = require(path.join(__dirname, 'build/Release/brains_memory_addon.node'));
  MemoryEngine = addon.MemoryEngine;
  EnhancedMemoryEngine = addon.EnhancedMemoryEngine;
} catch (err) {
  // Fallback to JavaScript implementation if addon fails to load
  console.warn('Warning: C++ addon failed to load, using JavaScript fallback:', err.message);
  MemoryEngine = require('./fallback.js');
  EnhancedMemoryEngine = null;
}

/**
 * High-performance memory engine with conflict resolution
 */
class BrainsMemoryEngine {
  constructor() {
    this.engine = new MemoryEngine();
    this.initialized = false;
  }

  /**
   * Initialize the engine with error categories
   * @param {Object} categories - Map of category names to regex pattern arrays
   * @returns {boolean} Success status
   */
  initialize(categories = {}) {
    try {
      // Convert single patterns to arrays for consistency
      const processedCategories = {};
      for (const [category, patterns] of Object.entries(categories)) {
        processedCategories[category] = Array.isArray(patterns) ? patterns : [patterns];
      }

      this.initialized = this.engine.initialize(processedCategories);
      return this.initialized;
    } catch (error) {
      console.error('Failed to initialize memory engine:', error);
      return false;
    }
  }

  /**
   * Store a solution in memory
   * @param {string} problem - Problem description
   * @param {string} category - Problem category (empty for auto-categorization)
   * @param {string} solution - Solution content
   * @param {boolean} isGlobal - Whether to store as global solution
   * @returns {boolean} Success status
   */
  storeSolution(problem, category = '', solution, isGlobal = false) {
    if (!this.initialized) {
      throw new Error('Memory engine not initialized');
    }

    try {
      return this.engine.storeSolution(problem, category, solution, isGlobal);
    } catch (error) {
      console.error('Failed to store solution:', error);
      return false;
    }
  }

  /**
   * Find a solution for a problem
   * @param {string} problem - Problem description
   * @param {string} category - Optional category hint
   * @returns {Object|null} Solution result with conflict resolution metadata
   */
  findSolution(problem, category = '') {
    if (!this.initialized) {
      throw new Error('Memory engine not initialized');
    }

    try {
      const result = this.engine.findSolution(problem, category);
      if (result && typeof result === 'string') {
        // Handle fallback implementation returning JSON string
        return JSON.parse(result);
      }
      return result;
    } catch (error) {
      console.error('Failed to find solution:', error);
      return null;
    }
  }

  /**
   * Categorize an error message
   * @param {string} errorMessage - Error message to categorize
   * @returns {string} Category name
   */
  categorizeError(errorMessage) {
    if (!this.initialized) {
      return 'errors_uncategorised';
    }

    try {
      return this.engine.categorizeError(errorMessage);
    } catch (error) {
      console.error('Failed to categorize error:', error);
      return 'errors_uncategorised';
    }
  }

  /**
   * Get performance statistics
   * @returns {Object} Statistics object
   */
  getStatistics() {
    if (!this.initialized) {
      return { error: 'Engine not initialized' };
    }

    try {
      const stats = this.engine.getStatistics();
      if (typeof stats === 'string') {
        return JSON.parse(stats);
      }
      return stats;
    } catch (error) {
      console.error('Failed to get statistics:', error);
      return { error: error.message };
    }
  }

  /**
   * Clear all cached data
   */
  clear() {
    if (!this.initialized) {
      return;
    }

    try {
      this.engine.clear();
    } catch (error) {
      console.error('Failed to clear engine:', error);
    }
  }

  /**
   * Load solutions in bulk
   * @param {string} category - Category name
   * @param {Object} solutions - Map of problem to solution content
   * @param {boolean} isGlobal - Whether these are global solutions
   */
  loadSolutions(category, solutions, isGlobal = false) {
    if (!this.initialized) {
      throw new Error('Memory engine not initialized');
    }

    try {
      return this.engine.loadSolutions(category, solutions, isGlobal);
    } catch (error) {
      console.error('Failed to load solutions:', error);
      return false;
    }
  }

  /**
   * Get engine type (for debugging)
   * @returns {string} Engine type
   */
  getEngineType() {
    return this.engine.constructor.name === 'MemoryEngine' ? 'C++' : 'JavaScript';
  }
}

module.exports = BrainsMemoryEngine;
module.exports.EnhancedMemoryEngine = EnhancedMemoryEngine;