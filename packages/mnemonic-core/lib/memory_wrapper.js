const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');

/**
 * High-level wrapper for the Brains Memory Engine
 * Provides compatibility with existing JavaScript implementation
 */
class MemoryWrapper {
  constructor() {
    try {
      const BrainsMemoryEngine = require('../native/index.js');
      this.engine = new BrainsMemoryEngine();
      this.engineType = 'C++';
    } catch (error) {
      console.warn('C++ engine unavailable, using JavaScript fallback:', error.message);
      this.engine = new (require('../native/fallback.js'))();
      this.engineType = 'JavaScript';
    }
    
    this.initialized = false;
    this.errorCategories = {};
  }

  /**
   * Initialize the engine with error categories from YAML file
   * @param {string} categoriesFile - Path to error_categories.yaml
   * @returns {boolean} Success status
   */
  async initializeFromFile(categoriesFile = './error_categories.yaml') {
    try {
      if (!fs.existsSync(categoriesFile)) {
        console.warn(`Categories file not found: ${categoriesFile}, using defaults`);
        return this.initializeWithDefaults();
      }

      const categoriesData = yaml.load(fs.readFileSync(categoriesFile, 'utf8'));
      
      if (!categoriesData || !categoriesData.error_categories) {
        console.warn('Invalid categories file format, using defaults');
        return this.initializeWithDefaults();
      }

      this.errorCategories = categoriesData.error_categories;
      
      // Convert single patterns to arrays for C++ engine
      const processedCategories = {};
      for (const [category, pattern] of Object.entries(this.errorCategories)) {
        processedCategories[category] = [pattern];
      }

      this.initialized = this.engine.initialize(processedCategories);
      return this.initialized;
    } catch (error) {
      console.error('Failed to initialize from file:', error);
      return this.initializeWithDefaults();
    }
  }

  /**
   * Initialize with default error categories
   * @returns {boolean} Success status
   */
  initializeWithDefaults() {
    const defaultCategories = {
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

    this.errorCategories = defaultCategories;
    this.initialized = this.engine.initialize(defaultCategories);
    return this.initialized;
  }

  /**
   * Load memory data from YAML files
   * @param {string} projectFile - Path to structured_memory.yaml
   * @param {string} globalFile - Path to global_structured_memory.yaml
   * @returns {boolean} Success status
   */
  async loadMemoryFromFiles(projectFile = './structured_memory.yaml', globalFile = './global_structured_memory.yaml') {
    if (!this.initialized) {
      throw new Error('Engine not initialized');
    }

    try {
      let loaded = false;

      // Load project memory
      if (fs.existsSync(projectFile)) {
        const projectData = yaml.load(fs.readFileSync(projectFile, 'utf8'));
        if (projectData && projectData.lessons_learned) {
          for (const [category, problems] of Object.entries(projectData.lessons_learned)) {
            const solutions = {};
            for (const [problem, data] of Object.entries(problems)) {
              if (data && data.solution) {
                solutions[problem] = data.solution;
              }
            }
            if (Object.keys(solutions).length > 0) {
              this.engine.loadSolutions(category, solutions, false);
              loaded = true;
            }
          }
        }
      }

      // Load global memory
      if (fs.existsSync(globalFile)) {
        const globalData = yaml.load(fs.readFileSync(globalFile, 'utf8'));
        if (globalData && globalData.lessons_learned) {
          for (const [category, problems] of Object.entries(globalData.lessons_learned)) {
            const solutions = {};
            for (const [problem, data] of Object.entries(problems)) {
              if (data && data.solution) {
                solutions[problem] = data.solution;
              }
            }
            if (Object.keys(solutions).length > 0) {
              this.engine.loadSolutions(category, solutions, true);
              loaded = true;
            }
          }
        }
      }

      return loaded;
    } catch (error) {
      console.error('Failed to load memory from files:', error);
      return false;
    }
  }

  /**
   * Find solution with enhanced API compatible with existing code
   * Auto-reloads from YAML files to ensure fresh data
   * @param {string} problem - Problem description
   * @param {string} category - Optional category hint
   * @returns {Object|null} Solution result in compatible format for layered retrieval
   */
  findSolution(problem, category = '') {
    if (!this.initialized) {
      // Try to initialize if not done yet
      this.initializeWithDefaults();
    }

    // Reload memory from files to get latest data
    this.loadMemoryFromFiles().catch(err => {
      console.warn('Failed to reload memory files:', err.message);
    });

    // Try direct YAML search first (more reliable)
    const yamlResult = this.searchInYAMLFiles(problem, category);
    if (yamlResult) {
      // Convert to format expected by layered retrieval
      return {
        category: yamlResult.category,
        solutions: [{
          problem: problem,
          solution: yamlResult.solution.content || yamlResult.solution,
          use_count: yamlResult.solution.use_count || 1,
          created_date: yamlResult.solution.created_date,
          source: yamlResult.source
        }],
        found: true,
        confidence: this.calculateMemoryConfidence(yamlResult, yamlResult.matchScore || 1.0)
      };
    }

    // Try memory engine as fallback
    const result = this.engine.findSolution(problem, category);
    if (result) {
      return {
        category: category || this.categorizeError(problem),
        solutions: [{
          problem: problem,
          solution: result.solution.content || result.solution,
          use_count: 1,
          created_date: new Date().toISOString(),
          source: result.solution.source || 'memory'
        }],
        found: true,
        confidence: 0.5
      };
    }

    return {
      category: category || 'unknown',
      solutions: [],
      found: false,
      confidence: 0
    };
  }

  /**
   * Calculate confidence score for memory results with production-grade reliability
   * @param {Object} yamlResult - YAML search result
   * @param {number} matchScore - Match quality score (0.0-1.0, default 1.0 for exact matches)
   * @returns {number} Confidence score (0.5-1.0)
   */
  calculateMemoryConfidence(yamlResult, matchScore = 1.0) {
    // Schema validation with graceful fallbacks
    if (!yamlResult?.solution?.content) {
      console.warn('Invalid YAML structure for confidence calculation:', yamlResult);
      return 0.5; // Fallback confidence for valid match with bad metadata
    }

    // Optional chaining with defensive defaults
    const useCount = yamlResult?.solution?.use_count ?? 0;
    const createdStr = yamlResult?.solution?.created_date;
    const created = new Date(createdStr);
    
    // Defensive date handling with bounds
    const daysOld = isNaN(created.getTime()) ? 365 : 
      Math.min(365, (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24));

    // Log-scaled use count boost (prevents runaway confidence)
    // Formula: log2(useCount + 1) / 5 caps practical boost at ~5+ uses
    const useBoost = Math.min(1.0, Math.log2(useCount + 1) / 5);
    
    // Sigmoid decay for recency (smooth degradation after 90 days)
    // Formula: 1 / (1 + e^((daysOld - 90) / 30))
    const recencyBoost = 1 / (1 + Math.exp((daysOld - 90) / 30));

    // Weighted confidence calculation
    // Base: 0.5, Use count: 30% weight, Recency: 20% weight
    let confidence = 0.5 + 0.3 * useBoost + 0.2 * recencyBoost;
    
    // Apply fuzzy match penalty (exact matches get full confidence)
    confidence *= matchScore;

    // Defensive bounds assertion (confidence must be between 0.5 and 1.0)
    confidence = Math.min(1.0, Math.max(0.5, confidence));

    // Structured observability logging for debugging and calibration
    const debugInfo = {
      timestamp: new Date().toISOString(),
      query: yamlResult.query || 'unknown',
      match_type: matchScore === 1.0 ? 'exact' : 'fuzzy',
      match_score: matchScore,
      use_count: useCount,
      created_date: createdStr || 'missing',
      created_days_ago: Math.round(daysOld),
      use_boost: Math.round(useBoost * 100) / 100,
      recency_boost: Math.round(recencyBoost * 100) / 100,
      confidence: Math.round(confidence * 100) / 100,
      fallback_used: createdStr ? false : true,
      threshold_met: confidence >= 0.7
    };

    console.log('Memory Confidence Debug:', debugInfo);

    return confidence;
  }

  /**
   * Search directly in YAML files for solutions
   * @param {string} problem - Problem description
   * @param {string} category - Optional category hint
   * @returns {Object|null} Solution result
   */
  searchInYAMLFiles(problem, category = '') {
    const files = ['./structured_memory.yaml', './global_structured_memory.yaml'];
    
    for (const fileName of files) {
      if (!fs.existsSync(fileName)) continue;
      
      try {
        const data = yaml.load(fs.readFileSync(fileName, 'utf8'));
        if (!data || !data.lessons_learned) continue;
        
        // Search in specified category or all categories
        const categoriesToSearch = category ? [category] : Object.keys(data.lessons_learned);
        
        for (const cat of categoriesToSearch) {
          if (!data.lessons_learned[cat]) continue;
          
          for (const [prob, solutionData] of Object.entries(data.lessons_learned[cat])) {
            // Fuzzy match: get match score instead of boolean
            const matchScore = this.isMatch(problem, prob);
            if (matchScore > 0) {
              return {
                category: cat,
                solution: {
                  content: solutionData.solution,
                  created_date: solutionData.created_date,
                  use_count: solutionData.use_count,
                  source: fileName.includes('global') ? 'global' : 'project'
                },
                found: true,
                source: fileName.includes('global') ? 'global' : 'project',
                matchScore: matchScore, // Pass match score for confidence calculation
                query: problem // Include query for debugging
              };
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to search in ${fileName}:`, error.message);
      }
    }
    
    return null;
  }

  /**
   * Calculate match score between search problem and stored problem (fuzzy matching with scoring)
   * @param {string} searchTerm - What user is searching for
   * @param {string} storedProblem - Problem stored in memory
   * @returns {number} Match score (0.0 = no match, 1.0 = exact match, 0.5-0.9 = fuzzy match)
   */
  isMatch(searchTerm, storedProblem) {
    const searchLower = searchTerm.toLowerCase().trim();
    const storedLower = storedProblem.toLowerCase().trim();
    
    // Exact match gets perfect score
    if (searchLower === storedLower) return 1.0;
    
    // Direct substring match gets high score
    if (searchLower.includes(storedLower) || storedLower.includes(searchLower)) {
      const longer = Math.max(searchLower.length, storedLower.length);
      const shorter = Math.min(searchLower.length, storedLower.length);
      return 0.8 + 0.1 * (shorter / longer); // 0.8-0.9 based on length similarity
    }
    
    // Word overlap scoring (more sophisticated fuzzy matching)
    const searchWords = searchLower.split(/\s+/).filter(w => w.length > 2);
    const storedWords = storedLower.split(/\s+/).filter(w => w.length > 2);
    
    if (searchWords.length === 0 || storedWords.length === 0) return 0.0;
    
    let exactWordMatches = 0;
    let partialWordMatches = 0;
    
    for (const searchWord of searchWords) {
      if (storedWords.includes(searchWord)) {
        exactWordMatches++;
      } else if (storedWords.some(stored => stored.includes(searchWord) || searchWord.includes(stored))) {
        partialWordMatches++;
      }
    }
    
    const totalWords = Math.min(searchWords.length, storedWords.length);
    const wordMatchRatio = (exactWordMatches + partialWordMatches * 0.5) / totalWords;
    
    // Require at least 50% word overlap for any match
    if (wordMatchRatio < 0.5) return 0.0;
    
    // Scale word match ratio to fuzzy match score (0.5-0.7 range)
    return 0.5 + wordMatchRatio * 0.2;
  }

  /**
   * Store solution with enhanced metadata and persist to YAML
   * @param {string} problem - Problem description
   * @param {string} category - Problem category
   * @param {string} solution - Solution content
   * @param {boolean} isGlobal - Whether to store as global solution
   * @returns {boolean} Success status
   */
  storeSolution(problem, category, solution, isGlobal = false) {
    if (!this.initialized) {
      return false;
    }

    // Store in memory engine
    const success = this.engine.storeSolution(problem, category, solution, isGlobal);
    
    if (success) {
      // Persist to YAML file
      this.persistSolutionToYAML(problem, category, solution, isGlobal);
    }
    
    return success;
  }

  /**
   * Persist solution to YAML file
   * @param {string} problem - Problem description
   * @param {string} category - Problem category
   * @param {string} solution - Solution content
   * @param {boolean} isGlobal - Whether to store as global solution
   */
  persistSolutionToYAML(problem, category, solution, isGlobal = false) {
    try {
      const fileName = isGlobal ? './global_structured_memory.yaml' : './structured_memory.yaml';
      
      // Read existing file or create new structure
      let data = {};
      if (fs.existsSync(fileName)) {
        data = yaml.load(fs.readFileSync(fileName, 'utf8')) || {};
      }
      
      // Initialize structure if needed
      if (!data.metadata) {
        data.metadata = {
          created_date: new Date().toISOString(),
          last_updated: new Date().toISOString(),
          sdk_version: '1.0.0',
          total_solutions: 0,
          project_name: isGlobal ? 'global-memory' : 'project-memory'
        };
      }
      
      if (!data.lessons_learned) {
        data.lessons_learned = {};
      }
      
      if (!data.lessons_learned[category]) {
        data.lessons_learned[category] = {};
      }
      
      // Add solution
      data.lessons_learned[category][problem] = {
        solution: solution,
        created_date: new Date().toISOString(),
        use_count: 1
      };
      
      // Update metadata
      data.metadata.last_updated = new Date().toISOString();
      data.metadata.total_solutions = this.countTotalSolutions(data.lessons_learned);
      
      // Create backup
      this.createBackup(fileName);
      
      // Write updated file
      fs.writeFileSync(fileName, yaml.dump(data, { indent: 2, lineWidth: 120 }));
      
    } catch (error) {
      console.warn('Failed to persist to YAML:', error.message);
    }
  }

  /**
   * Count total solutions in lessons_learned structure
   * @param {Object} lessonsLearned - Lessons learned object
   * @returns {number} Total solution count
   */
  countTotalSolutions(lessonsLearned) {
    let total = 0;
    for (const category in lessonsLearned) {
      total += Object.keys(lessonsLearned[category]).length;
    }
    return total;
  }

  /**
   * Create backup of memory file
   * @param {string} fileName - File to backup
   */
  createBackup(fileName) {
    try {
      if (fs.existsSync(fileName)) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
        const backupDir = './backups';
        
        if (!fs.existsSync(backupDir)) {
          fs.mkdirSync(backupDir, { recursive: true });
        }
        
        const baseName = path.basename(fileName, '.yaml');
        const backupName = `${backupDir}/${baseName}_${timestamp}.yaml`;
        fs.copyFileSync(fileName, backupName);
      }
    } catch (error) {
      console.warn('Failed to create backup:', error.message);
    }
  }

  /**
   * Categorize error message
   * @param {string} errorMessage - Error message to categorize
   * @returns {string} Category name
   */
  categorizeError(errorMessage) {
    if (!this.initialized) {
      return 'errors_uncategorised';
    }

    return this.engine.categorizeError(errorMessage);
  }

  /**
   * Get performance statistics
   * @returns {Object} Statistics object
   */
  getStatistics() {
    if (!this.initialized) {
      return { error: 'Engine not initialized' };
    }

    const stats = this.engine.getStatistics();
    
    // Add engine type information
    if (typeof stats === 'object') {
      stats.engine_type = this.engineType;
    }
    
    return stats;
  }

  /**
   * Get engine information
   * @returns {Object} Engine info
   */
  getEngineInfo() {
    return {
      type: this.engineType,
      initialized: this.initialized,
      categories: Object.keys(this.errorCategories).length,
      version: '2.0.0'
    };
  }

  /**
   * Clear all cached data
   */
  clear() {
    if (this.initialized) {
      this.engine.clear();
    }
  }

  /**
   * Performance benchmark
   * @param {number} iterations - Number of test iterations
   * @returns {Object} Benchmark results
   */
  benchmark(iterations = 1000) {
    if (!this.initialized) {
      return { error: 'Engine not initialized' };
    }

    const testProblem = 'OAuth PKCE intent not triggering';
    const testError = 'HTTP connection timeout error';
    
    const startTime = Date.now();
    
    for (let i = 0; i < iterations; i++) {
      this.categorizeError(testError);
      this.findSolution(testProblem);
    }
    
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    const operationsPerSecond = (iterations * 2) / (totalTime / 1000);
    
    return {
      iterations: iterations * 2,
      total_time_ms: totalTime,
      avg_operation_time_ms: totalTime / (iterations * 2),
      operations_per_second: Math.round(operationsPerSecond),
      engine_type: this.engineType
    };
  }
}

module.exports = MemoryWrapper;