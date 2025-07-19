const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');

/**
 * Enhanced wrapper for the AI-powered Brains Memory Engine
 * Includes context analysis and intelligent solution ranking
 */
class EnhancedMemoryWrapper {
  constructor() {
    try {
      const { EnhancedMemoryEngine } = require('../native/index.js');
      this.engine = new EnhancedMemoryEngine();
      this.engineType = 'Enhanced C++';
    } catch (error) {
      console.warn('Enhanced C++ engine unavailable, using fallback:', error.message);
      // Use regular memory wrapper as fallback
      const MemoryWrapper = require('./memory_wrapper.js');
      this.fallbackWrapper = new MemoryWrapper();
      this.engineType = 'JavaScript Fallback';
    }
    
    this.initialized = false;
    this.errorCategories = {};
    this.contextAnalyzer = new ContextAnalyzer();
  }

  /**
   * Initialize the enhanced engine with error categories
   * @param {string} categoriesFile - Path to error_categories.yaml
   * @returns {boolean} Success status
   */
  async initializeFromFile(categoriesFile = './error_categories.yaml') {
    try {
      if (this.fallbackWrapper) {
        return await this.fallbackWrapper.initializeFromFile(categoriesFile);
      }

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

      const success = this.engine.initialize(processedCategories);
      if (success) {
        this.initialized = true;
        console.log(`Enhanced Memory Engine initialized with ${Object.keys(this.errorCategories).length} categories`);
      }
      
      return success;
    } catch (error) {
      console.error('Failed to initialize enhanced engine:', error.message);
      return false;
    }
  }

  /**
   * Initialize with default error categories
   * @returns {boolean} Success status
   */
  initializeWithDefaults() {
    if (this.fallbackWrapper) {
      return this.fallbackWrapper.initializeWithDefaults();
    }

    const defaultCategories = {
      authentication: ['auth.*error', 'oauth.*error', 'login.*failed'],
      networking: ['http.*timeout', 'connection.*refused', 'network.*error'],
      database: ['db.*error', 'database.*connection', 'sql.*error'],
      build: ['build.*failed', 'compilation.*error', 'dependency.*error'],
      api: ['api.*error', 'rest.*error', 'graphql.*error'],
      configuration: ['config.*error', 'env.*missing', 'setting.*invalid']
    };

    try {
      const success = this.engine.initialize(defaultCategories);
      if (success) {
        this.initialized = true;
        this.errorCategories = defaultCategories;
        console.log('Enhanced Memory Engine initialized with default categories');
      }
      return success;
    } catch (error) {
      console.error('Failed to initialize with defaults:', error.message);
      return false;
    }
  }

  /**
   * Find solutions with AI-powered ranking
   * @param {string} problem - Problem description
   * @param {string} category - Optional category hint
   * @param {string} context - Additional context for relevance scoring
   * @returns {Object} Enhanced solution result with AI ranking
   */
  findSolutionWithAI(problem, category = '', context = '') {
    if (this.fallbackWrapper) {
      // Enhanced context analysis for fallback
      const enhancedContext = this.contextAnalyzer.enhanceContext(problem, context);
      const result = this.fallbackWrapper.findSolution(problem, category);
      
      if (result && result.found) {
        result.ai_enhanced = true;
        result.context_score = this.contextAnalyzer.scoreRelevance(result.solution.content, enhancedContext);
        result.enhanced_context = enhancedContext;
      }
      
      return result;
    }

    try {
      const rankedSolutions = this.engine.findRankedSolutions(problem, category, 1);
      
      if (rankedSolutions && rankedSolutions.length > 0) {
        const topSolution = rankedSolutions[0];
        const enhancedContext = this.contextAnalyzer.enhanceContext(problem, context);
        
        return {
          category: category || this.engine.categorizeError(problem),
          solution: topSolution.solution,
          source: topSolution.solution.source,
          found: true,
          ai_score: topSolution.score,
          context_analysis: enhancedContext,
          ranking: 'AI-powered',
          performance: {
            engine_type: this.engineType
          }
        };
      } else {
        return {
          category: this.engine.categorizeError(problem),
          solution: null,
          source: null,
          found: false,
          ai_score: 0,
          context_analysis: this.contextAnalyzer.enhanceContext(problem, context)
        };
      }
    } catch (error) {
      console.error('AI-powered solution lookup failed:', error.message);
      return this.findSolution(problem, category); // Fallback to regular search
    }
  }

  /**
   * Get multiple ranked solution suggestions
   * @param {string} problem - Problem description
   * @param {string} context - Additional context
   * @param {number} maxSuggestions - Maximum number of suggestions
   * @returns {Object} Ranked suggestions with scores
   */
  getSuggestions(problem, context = '', maxSuggestions = 5) {
    if (this.fallbackWrapper) {
      // Create enhanced suggestions using context analysis
      const enhancedContext = this.contextAnalyzer.enhanceContext(problem, context);
      const basicResult = this.fallbackWrapper.findSolution(problem);
      
      const suggestions = [];
      if (basicResult && basicResult.found) {
        suggestions.push({
          solution: basicResult.solution.content,
          score: this.contextAnalyzer.scoreRelevance(basicResult.solution.content, enhancedContext),
          source: basicResult.source,
          use_count: basicResult.solution.use_count || 1,
          created_date: basicResult.solution.created_date || new Date().toISOString()
        });
      }
      
      return {
        suggestions,
        total_found: suggestions.length,
        context: enhancedContext,
        engine_type: this.engineType
      };
    }

    try {
      const enhancedContext = this.contextAnalyzer.enhanceContext(problem, context);
      const suggestionsJson = this.engine.getSuggestions(problem, enhancedContext);
      const parsed = JSON.parse(suggestionsJson);
      
      // Enhance with context analysis
      parsed.context_analysis = this.contextAnalyzer.analyzeContext(enhancedContext);
      parsed.engine_type = this.engineType;
      
      return parsed;
    } catch (error) {
      console.error('AI suggestions failed:', error.message);
      return {
        suggestions: [],
        total_found: 0,
        context: context,
        error: error.message,
        engine_type: this.engineType
      };
    }
  }

  /**
   * Store a solution with enhanced metadata
   * @param {string} problem - Problem description
   * @param {string} category - Problem category
   * @param {string} solution - Solution content
   * @param {boolean} isGlobal - Whether to store globally
   * @returns {boolean} Success status
   */
  storeSolution(problem, category, solution, isGlobal = false) {
    if (this.fallbackWrapper) {
      return this.fallbackWrapper.storeSolution(problem, category, solution, isGlobal);
    }

    try {
      return this.engine.storeSolution(problem, category, solution, isGlobal);
    } catch (error) {
      console.error('Failed to store solution:', error.message);
      return false;
    }
  }

  /**
   * Regular solution finding (compatibility method)
   */
  findSolution(problem, category = '') {
    if (this.fallbackWrapper) {
      return this.fallbackWrapper.findSolution(problem, category);
    }

    try {
      const result = this.engine.findSolution(problem, category);
      return result || { found: false, category: this.engine.categorizeError(problem) };
    } catch (error) {
      console.error('Solution lookup failed:', error.message);
      return { found: false, error: error.message };
    }
  }

  /**
   * Categorize an error message
   */
  categorizeError(message) {
    if (this.fallbackWrapper) {
      return this.fallbackWrapper.categorizeError(message);
    }

    try {
      return this.engine.categorizeError(message);
    } catch (error) {
      console.error('Error categorization failed:', error.message);
      return 'errors_uncategorised';
    }
  }

  /**
   * Get engine information and statistics
   */
  getEngineInfo() {
    if (this.fallbackWrapper) {
      const info = this.fallbackWrapper.getEngineInfo();
      info.ai_enhanced = true;
      info.context_analysis = true;
      return info;
    }

    try {
      const stats = JSON.parse(this.engine.getStatistics());
      return {
        type: this.engineType,
        version: '2.1.0',
        initialized: this.initialized,
        categories: Object.keys(this.errorCategories).length,
        ai_enhanced: true,
        context_analysis: true,
        ...stats
      };
    } catch (error) {
      return {
        type: this.engineType,
        version: '2.1.0',
        initialized: this.initialized,
        error: error.message
      };
    }
  }

  /**
   * Load memory from YAML files
   */
  async loadMemoryFromFiles() {
    if (this.fallbackWrapper) {
      return await this.fallbackWrapper.loadMemoryFromFiles();
    }

    // Implementation would load from YAML files and populate the C++ engine
    // For now, return true to indicate compatibility
    return true;
  }

  /**
   * Run performance benchmark
   */
  benchmark(iterations = 1000) {
    if (this.fallbackWrapper) {
      return this.fallbackWrapper.benchmark(iterations);
    }

    const start = Date.now();
    const testProblem = 'OAuth authentication error';
    
    for (let i = 0; i < iterations; i++) {
      this.findSolution(testProblem);
    }
    
    const elapsed = Date.now() - start;
    
    return {
      iterations,
      total_time_ms: elapsed,
      avg_time_ms: elapsed / iterations,
      operations_per_second: Math.round((iterations / elapsed) * 1000),
      engine_type: this.engineType
    };
  }

  /**
   * Get detailed statistics
   */
  getStatistics() {
    if (this.fallbackWrapper) {
      const stats = this.fallbackWrapper.getStatistics();
      return {
        ...JSON.parse(stats),
        ai_enhanced: true,
        context_analysis: true
      };
    }

    try {
      return JSON.parse(this.engine.getStatistics());
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Clear all cached data
   */
  clear() {
    if (this.fallbackWrapper) {
      return this.fallbackWrapper.clear();
    }

    try {
      this.engine.clear();
    } catch (error) {
      console.error('Failed to clear engine:', error.message);
    }
  }
}

/**
 * Context Analysis Helper Class
 * Provides intelligent context enhancement and relevance scoring
 */
class ContextAnalyzer {
  /**
   * Enhance context by extracting key information
   * @param {string} problem - Original problem description
   * @param {string} context - Additional context
   * @returns {string} Enhanced context
   */
  enhanceContext(problem, context = '') {
    const combined = `${problem} ${context}`.toLowerCase();
    const enhancements = [];

    // Technology stack detection
    const techStacks = {
      javascript: ['js', 'node', 'npm', 'yarn', 'webpack', 'babel'],
      react: ['react', 'jsx', 'component', 'hook', 'state'],
      auth: ['oauth', 'jwt', 'token', 'auth', 'login', 'session'],
      database: ['sql', 'mysql', 'postgres', 'mongodb', 'database', 'db'],
      api: ['api', 'rest', 'graphql', 'endpoint', 'request'],
      build: ['build', 'compile', 'bundle', 'deploy', 'ci', 'cd']
    };

    for (const [tech, keywords] of Object.entries(techStacks)) {
      if (keywords.some(keyword => combined.includes(keyword))) {
        enhancements.push(`tech:${tech}`);
      }
    }

    // Error severity detection
    const severityKeywords = {
      critical: ['crash', 'fail', 'broken', 'error', 'exception'],
      warning: ['warn', 'deprecat', 'slow', 'timeout'],
      info: ['info', 'debug', 'log', 'trace']
    };

    for (const [severity, keywords] of Object.entries(severityKeywords)) {
      if (keywords.some(keyword => combined.includes(keyword))) {
        enhancements.push(`severity:${severity}`);
        break;
      }
    }

    // Environment detection
    if (combined.includes('prod') || combined.includes('production')) {
      enhancements.push('env:production');
    } else if (combined.includes('dev') || combined.includes('development')) {
      enhancements.push('env:development');
    } else if (combined.includes('test')) {
      enhancements.push('env:testing');
    }

    const enhanced = `${problem} ${context} ${enhancements.join(' ')}`.trim();
    return enhanced;
  }

  /**
   * Score the relevance of a solution to the context
   * @param {string} solution - Solution content
   * @param {string} context - Enhanced context
   * @returns {number} Relevance score between 0 and 1
   */
  scoreRelevance(solution, context) {
    if (!solution || !context) return 0.3;

    const solutionLower = solution.toLowerCase();
    const contextLower = context.toLowerCase();

    let score = 0.3; // Base score

    // Extract keywords from context
    const contextWords = contextLower.split(/\s+/).filter(word => word.length > 3);
    const solutionWords = solutionLower.split(/\s+/);

    // Calculate keyword overlap
    const matches = contextWords.filter(word => 
      solutionWords.some(solutionWord => solutionWord.includes(word) || word.includes(solutionWord))
    );

    if (contextWords.length > 0) {
      score += (matches.length / contextWords.length) * 0.4;
    }

    // Bonus for tech stack alignment
    if (contextLower.includes('tech:') && solutionLower.includes('npm')) score += 0.2;
    if (contextLower.includes('tech:react') && solutionLower.includes('react')) score += 0.2;
    if (contextLower.includes('tech:auth') && solutionLower.includes('auth')) score += 0.2;

    // Bonus for environment relevance
    if (contextLower.includes('env:production') && solutionLower.includes('production')) score += 0.1;

    return Math.min(1.0, score);
  }

  /**
   * Analyze context and provide insights
   * @param {string} context - Enhanced context
   * @returns {Object} Context analysis
   */
  analyzeContext(context) {
    const analysis = {
      technologies: [],
      severity: 'unknown',
      environment: 'unknown',
      keywords: []
    };

    const contextLower = context.toLowerCase();

    // Extract technologies
    const techMatches = contextLower.match(/tech:(\w+)/g);
    if (techMatches) {
      analysis.technologies = techMatches.map(match => match.replace('tech:', ''));
    }

    // Extract severity
    const severityMatch = contextLower.match(/severity:(\w+)/);
    if (severityMatch) {
      analysis.severity = severityMatch[1];
    }

    // Extract environment
    const envMatch = contextLower.match(/env:(\w+)/);
    if (envMatch) {
      analysis.environment = envMatch[1];
    }

    // Extract meaningful keywords
    analysis.keywords = contextLower
      .split(/\s+/)
      .filter(word => word.length > 3 && !word.startsWith('tech:') && !word.startsWith('severity:') && !word.startsWith('env:'))
      .slice(0, 10); // Limit to 10 keywords

    return analysis;
  }
}

module.exports = EnhancedMemoryWrapper;