/**
 * Layered Retrieval Orchestrator for Brains Memory System
 * Implements the memory-first paradigm with confidence-based external search
 */

const fs = require('fs');
const yaml = require('js-yaml');
const MemoryWrapper = require('./memory_wrapper');
const ConfidenceCalibration = require('./confidence_calibration');
const GitHubTrustScoring = require('./github_trust_scoring');
const GitHubIntegration = require('./github_integration');
const DocumentationSearch = require('./documentation_search');
const SynthesisEngine = require('./synthesis_engine');
const RetryFailoverManager = require('./retry_failover');
const ConsentManager = require('./consent_manager');
const MonitoringGovernance = require('./monitoring_governance');

class LayeredRetrieval {
  constructor(configPath = './brains-config.yaml') {
    this.configPath = configPath;
    this.config = this.loadConfig();
    
    // Initialize all components (keeping GitHub for future)
    this.memory = new MemoryWrapper();
    this.confidenceCalibration = new ConfidenceCalibration(configPath);
    this.githubTrustScoring = new GitHubTrustScoring(configPath);
    this.githubIntegration = new GitHubIntegration(configPath);
    this.documentationSearch = new DocumentationSearch(configPath);
    this.synthesisEngine = new SynthesisEngine(configPath);
    this.retryManager = new RetryFailoverManager(configPath);
    this.consentManager = new ConsentManager(configPath);
    this.monitoring = new MonitoringGovernance(configPath);
    
    // Initialize cross-dependencies
    this.githubIntegration.initialize(this.githubTrustScoring, this.retryManager);
    this.documentationSearch.initialize(this.retryManager);
    this.synthesisEngine.initialize(this.confidenceCalibration);
    
    // Load configuration thresholds
    this.thresholds = this.config.layered_retrieval?.confidence_thresholds || {
      memory_sufficient: 0.70,
      github_expansion: 0.30,
      documentation_minimum: 0.10
    };
    
    console.log('🧠 Layered Retrieval System initialized with thresholds:', this.thresholds);
  }

  loadConfig() {
    try {
      return yaml.load(fs.readFileSync(this.configPath, 'utf8'));
    } catch (error) {
      console.warn('Could not load config, using defaults:', error.message);
      return this.getDefaultConfig();
    }
  }

  /**
   * Main search function implementing layered retrieval
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Complete search result with synthesis
   */
  async search(query, options = {}) {
    const startTime = Date.now();
    const searchOptions = {
      maxLayers: options.maxLayers || 3,
      allowGitHub: options.allowGitHub || false, // Disabled by default for now
      allowDocs: options.allowDocs !== false,
      category: options.category || 'general',
      forceExternalSearch: options.forceExternalSearch || false,
      ...options
    };

    console.log(`\n🔍 Starting layered retrieval for: "${query}"`);
    console.log(`   Options: maxLayers=${searchOptions.maxLayers}, allowGitHub=${searchOptions.allowGitHub}, allowDocs=${searchOptions.allowDocs}`);

    // Initialize search context
    const searchContext = {
      query: query,
      options: searchOptions,
      startTime: startTime,
      layers: [],
      totalSources: 0,
      externalCallsMade: 0,
      consentRequired: false,
      synthesisRequired: false
    };

    // Update metrics
    this.monitoring.incrementMetric('search.total_requests');
    this.monitoring.auditLog('search_started', {
      query: query,
      options: searchOptions
    });

    try {
      // Layer 1: Memory Search (Institutional Knowledge)
      const memoryResult = await this.searchMemoryLayer(query, searchOptions, searchContext);
      
      // Check if memory result is sufficient
      if (memoryResult.confidence >= this.thresholds.memory_sufficient && !searchOptions.forceExternalSearch) {
        console.log(`✅ Memory layer sufficient (confidence: ${Math.round(memoryResult.confidence * 100)}%)`);
        return this.buildFinalResult(searchContext, memoryResult, 'memory_sufficient');
      }

      console.log(`📊 Memory confidence: ${Math.round(memoryResult.confidence * 100)}%, continuing to external layers...`);

      // Layer 2: GitHub Search (Community Knowledge) - disabled by default
      let githubResult = null;
      if (searchOptions.allowGitHub && searchOptions.maxLayers >= 2) {
        githubResult = await this.searchGitHubLayer(query, searchOptions, searchContext);
        
        // Check if GitHub + memory synthesis is sufficient
        if (githubResult && githubResult.confidence >= this.thresholds.github_expansion) {
          console.log(`✅ GitHub layer sufficient (confidence: ${Math.round(githubResult.confidence * 100)}%)`);
          const synthesized = await this.synthesizeResults(searchContext, memoryResult, githubResult);
          return this.buildFinalResult(searchContext, synthesized, 'github_sufficient');
        }
      }

      // Layer 3: Documentation Search (Official Sources)
      let docResult = null;
      if (searchOptions.allowDocs && searchOptions.maxLayers >= 3) {
        docResult = await this.searchDocumentationLayer(query, searchOptions, searchContext);
      }

      // Final synthesis of all available sources
      const finalResult = await this.synthesizeAllSources(searchContext, memoryResult, githubResult, docResult);
      
      return this.buildFinalResult(searchContext, finalResult, 'full_synthesis');

    } catch (error) {
      console.error('❌ Layered retrieval failed:', error.message);
      this.monitoring.incrementMetric('errors.total');
      this.monitoring.auditLog('search_failed', {
        query: query,
        error: error.message
      }, 'error');

      return {
        query: query,
        success: false,
        error: error.message,
        layers_completed: searchContext.layers.length,
        search_metadata: {
          timestamp: new Date().toISOString(),
          duration_ms: Date.now() - startTime,
          layers: searchContext.layers
        }
      };
    }
  }

  /**
   * Search memory layer (Layer 1)
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @param {Object} context - Search context
   * @returns {Promise<Object>} Memory search result
   */
  async searchMemoryLayer(query, options, context) {
    console.log('🧠 Layer 1: Searching memory...');
    
    const memorySearchResult = await this.memory.findSolution(query, options.category);
    
    // Use production-grade confidence from memory wrapper
    const confidence = memorySearchResult.confidence || 0;
    let results = [];
    
    if (memorySearchResult.solutions && memorySearchResult.solutions.length > 0) {
      results = memorySearchResult.solutions.map(solution => ({
        type: 'memory',
        title: solution.problem,
        solution: solution.solution,
        use_count: solution.use_count || 1,
        created_date: solution.created_date,
        trust_score: 1.0, // Memory always has highest trust
        source: 'institutional_memory'
      }));
    }

    // Apply confidence calibration
    const calibratedConfidence = this.confidenceCalibration.getAdjustedConfidence(confidence, 'memory');
    
    const layerResult = {
      layer: 1,
      source: 'memory',
      confidence: calibratedConfidence,
      results: results,
      total_results: results.length,
      search_time_ms: 50 // Memory search is fast
    };

    context.layers.push(layerResult);
    context.totalSources += results.length;
    
    // Update metrics
    this.monitoring.incrementMetric('search.memory_hits');
    this.monitoring.recordTiming('search.memory_duration', layerResult.search_time_ms);
    
    return layerResult;
  }

  /**
   * Search GitHub layer (Layer 2)
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @param {Object} context - Search context
   * @returns {Promise<Object>} GitHub search result
   */
  async searchGitHubLayer(query, options, context) {
    console.log('🔍 Layer 2: Searching GitHub...');
    
    // Check if consent is required
    const consentResult = await this.consentManager.requestConsent('github', query, {
      confidence: context.layers[0]?.confidence || 0,
      category: options.category
    });

    if (!consentResult.granted) {
      console.log('❌ GitHub search consent denied');
      return null;
    }

    context.consentRequired = true;
    context.externalCallsMade++;
    
    const searchStart = Date.now();
    
    try {
      const githubResults = await this.githubIntegration.searchRepositories(query, {
        maxResults: 10,
        language: options.language,
        trustThreshold: 0.1
      });

      const searchTime = Date.now() - searchStart;
      
      // Calculate confidence based on GitHub results
      let confidence = 0;
      if (githubResults.total_results > 0) {
        const avgTrustScore = githubResults.results.reduce((sum, r) => sum + r.trust_score, 0) / githubResults.results.length;
        confidence = Math.min(avgTrustScore * 0.8, 0.9); // GitHub max confidence is 0.9
      }

      const calibratedConfidence = this.confidenceCalibration.getAdjustedConfidence(confidence, 'github');
      
      const layerResult = {
        layer: 2,
        source: 'github',
        confidence: calibratedConfidence,
        results: githubResults.results,
        total_results: githubResults.total_results,
        search_time_ms: searchTime,
        rate_limit_info: this.githubIntegration.getRateLimitStatus()
      };

      context.layers.push(layerResult);
      context.totalSources += githubResults.total_results;
      
      // Update metrics
      this.monitoring.incrementMetric('search.github_calls');
      this.monitoring.recordTiming('search.github_duration', searchTime);
      
      return layerResult;
      
    } catch (error) {
      console.error('❌ GitHub search failed:', error.message);
      this.monitoring.incrementMetric('errors.github_failures');
      return null;
    }
  }

  /**
   * Search documentation layer (Layer 3)
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @param {Object} context - Search context
   * @returns {Promise<Object>} Documentation search result
   */
  async searchDocumentationLayer(query, options, context) {
    console.log('📚 Layer 3: Searching documentation...');
    
    // Check if consent is required
    const consentResult = await this.consentManager.requestConsent('documentation', query, {
      confidence: context.layers[context.layers.length - 1]?.confidence || 0,
      category: options.category
    });

    if (!consentResult.granted) {
      console.log('❌ Documentation search consent denied');
      return null;
    }

    context.consentRequired = true;
    context.externalCallsMade++;
    
    const searchStart = Date.now();
    
    try {
      const docResults = await this.documentationSearch.searchDocumentation(query, {
        maxResults: 5,
        categories: this.inferDocumentationCategories(query, options),
        trustThreshold: 0.7
      });

      const searchTime = Date.now() - searchStart;
      
      // Calculate confidence based on documentation results
      let confidence = 0;
      if (docResults.total_results > 0) {
        const avgTrustScore = docResults.results.reduce((sum, r) => sum + r.trust_score, 0) / docResults.results.length;
        confidence = avgTrustScore * 0.95; // Documentation can have very high confidence
      }

      const calibratedConfidence = this.confidenceCalibration.getAdjustedConfidence(confidence, 'documentation');
      
      const layerResult = {
        layer: 3,
        source: 'documentation',
        confidence: calibratedConfidence,
        results: docResults.results,
        total_results: docResults.total_results,
        search_time_ms: searchTime,
        sources_searched: docResults.sources_searched
      };

      context.layers.push(layerResult);
      context.totalSources += docResults.total_results;
      
      // Update metrics
      this.monitoring.incrementMetric('search.documentation_calls');
      this.monitoring.recordTiming('search.documentation_duration', searchTime);
      
      return layerResult;
      
    } catch (error) {
      console.error('❌ Documentation search failed:', error.message);
      this.monitoring.incrementMetric('errors.documentation_failures');
      return null;
    }
  }

  /**
   * Synthesize results from two sources
   * @param {Object} context - Search context
   * @param {Object} memoryResult - Memory layer result
   * @param {Object} secondaryResult - Secondary layer result
   * @returns {Promise<Object>} Synthesized result
   */
  async synthesizeResults(context, memoryResult, secondaryResult) {
    console.log('🔄 Synthesizing results from multiple sources...');
    
    const sources = [
      { name: 'memory', data: memoryResult.results, weight: 0.60 },
      { name: secondaryResult.source, data: secondaryResult.results, weight: secondaryResult.source === 'github' ? 0.25 : 0.30 }
    ];

    const synthesisResult = await this.synthesisEngine.synthesizeSources(context.query, sources);
    
    // Calculate combined confidence
    const combinedConfidence = (memoryResult.confidence * 0.60) + (secondaryResult.confidence * 0.40);
    
    context.synthesisRequired = true;
    
    return {
      type: 'synthesis',
      confidence: combinedConfidence,
      synthesized_solution: synthesisResult.synthesized_solution,
      conflicts_detected: synthesisResult.conflicts_detected,
      source_breakdown: synthesisResult.source_breakdown,
      quality_score: synthesisResult.quality_score
    };
  }

  /**
   * Synthesize results from all available sources
   * @param {Object} context - Search context
   * @param {Object} memoryResult - Memory layer result
   * @param {Object} githubResult - GitHub layer result
   * @param {Object} docResult - Documentation layer result
   * @returns {Promise<Object>} Synthesized result
   */
  async synthesizeAllSources(context, memoryResult, githubResult, docResult) {
    console.log('🔄 Synthesizing all available sources...');
    
    const sources = [
      { name: 'memory', data: memoryResult.results, weight: 0.60 }
    ];

    let combinedConfidence = memoryResult.confidence * 0.40;
    
    if (docResult && docResult.results.length > 0) {
      sources.push({ name: 'documentation', data: docResult.results, weight: 0.30 });
      combinedConfidence += docResult.confidence * 0.30;
    }
    
    if (githubResult && githubResult.results.length > 0) {
      sources.push({ name: 'github', data: githubResult.results, weight: 0.25 });
      combinedConfidence += githubResult.confidence * 0.20;
    }

    const synthesisResult = await this.synthesisEngine.synthesizeSources(context.query, sources);
    
    context.synthesisRequired = true;
    
    // Update synthesis metrics
    if (synthesisResult.conflicts_detected.length > 0) {
      this.monitoring.incrementMetric('synthesis.conflicts_detected');
    }
    
    return {
      type: 'full_synthesis',
      confidence: Math.min(combinedConfidence, 1.0),
      synthesized_solution: synthesisResult.synthesized_solution,
      conflicts_detected: synthesisResult.conflicts_detected,
      source_breakdown: synthesisResult.source_breakdown,
      quality_score: synthesisResult.quality_score
    };
  }

  /**
   * Build final result structure
   * @param {Object} context - Search context
   * @param {Object} result - Final result data
   * @param {string} terminationReason - Why search stopped
   * @returns {Object} Final formatted result
   */
  buildFinalResult(context, result, terminationReason) {
    const duration = Date.now() - context.startTime;
    
    // Log prediction for confidence calibration
    this.confidenceCalibration.logPrediction(
      context.query,
      result.confidence,
      true, // Assume success if we got here
      result.type || 'unknown'
    );

    // Update calculated metrics
    const externalCallRate = context.externalCallsMade / Math.max(context.totalSources, 1);
    this.monitoring.setMetric('search.external_call_rate', externalCallRate);
    this.monitoring.setMetric('search.confidence_rate', result.confidence);
    
    // Audit log
    this.monitoring.auditLog('search_completed', {
      query: context.query,
      termination_reason: terminationReason,
      layers_used: context.layers.length,
      external_calls: context.externalCallsMade,
      confidence: result.confidence,
      synthesis_required: context.synthesisRequired
    });

    const finalResult = {
      query: context.query,
      success: true,
      confidence: result.confidence,
      termination_reason: terminationReason,
      
      // Main result
      solution: result.synthesized_solution || result.results?.[0]?.solution || 'No solution found',
      
      // Metadata
      search_metadata: {
        timestamp: new Date().toISOString(),
        duration_ms: duration,
        layers_used: context.layers.length,
        total_sources: context.totalSources,
        external_calls_made: context.externalCallsMade,
        consent_required: context.consentRequired,
        synthesis_required: context.synthesisRequired,
        confidence_thresholds: this.thresholds
      },
      
      // Detailed layer results
      layers: context.layers,
      
      // Synthesis information (if applicable)
      ...(result.conflicts_detected && {
        conflicts_detected: result.conflicts_detected,
        source_breakdown: result.source_breakdown,
        quality_score: result.quality_score
      })
    };

    console.log(`\n✅ Search completed in ${duration}ms`);
    console.log(`   Confidence: ${Math.round(result.confidence * 100)}%`);
    console.log(`   Layers used: ${context.layers.length}`);
    console.log(`   External calls: ${context.externalCallsMade}`);
    
    return finalResult;
  }

  /**
   * Infer documentation categories from query and options
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Array} Inferred categories
   */
  inferDocumentationCategories(query, options) {
    const queryLower = query.toLowerCase();
    const categories = [];
    
    // Language detection
    if (queryLower.includes('javascript') || queryLower.includes('js')) categories.push('javascript');
    if (queryLower.includes('python') || queryLower.includes('py')) categories.push('python');
    if (queryLower.includes('node') || queryLower.includes('nodejs')) categories.push('nodejs');
    if (queryLower.includes('react')) categories.push('react');
    if (queryLower.includes('vue')) categories.push('vue');
    if (queryLower.includes('angular')) categories.push('angular');
    if (queryLower.includes('typescript')) categories.push('typescript');
    
    // Domain detection
    if (queryLower.includes('web') || queryLower.includes('browser')) categories.push('web');
    if (queryLower.includes('api') || queryLower.includes('rest')) categories.push('api');
    if (queryLower.includes('backend') || queryLower.includes('server')) categories.push('backend');
    if (queryLower.includes('frontend') || queryLower.includes('ui')) categories.push('frontend');
    
    // Use option category if no specific categories detected
    if (categories.length === 0 && options.category) {
      categories.push(options.category);
    }
    
    return categories;
  }

  /**
   * Get system status for monitoring
   * @returns {Object} System status
   */
  async getSystemStatus() {
    return {
      timestamp: new Date().toISOString(),
      thresholds: this.thresholds,
      monitoring: await this.monitoring.getSystemStatus(),
      components: {
        memory: { status: 'operational' },
        github: { 
          status: 'operational',
          rate_limit: this.githubIntegration.getRateLimitStatus()
        },
        documentation: { 
          status: 'operational',
          sources: this.documentationSearch.getSourcesStatus()
        },
        synthesis: { status: 'operational' },
        consent: { 
          status: 'operational',
          stats: this.consentManager.getConsentStats()
        }
      }
    };
  }

  /**
   * Search without interactive consent prompts (for automated testing/CI)
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Search result without external consent prompts
   */
  async searchWithoutConsent(query, options = {}) {
    console.log('🤖 Non-interactive search mode (no external consent prompts)');
    
    const searchOptions = {
      ...options,
      allowDocs: false,    // Disable documentation layer to avoid consent
      allowGitHub: false,  // Disable GitHub layer to avoid consent
      maxLayers: 1         // Only use memory layer
    };

    return await this.search(query, searchOptions);
  }

  /**
   * Search with programmatic consent (for testing with external layers)
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Search result with auto-granted consent
   */
  async searchForTesting(query, options = {}) {
    if (!this.config.development?.test_mode) {
      throw new Error('searchForTesting can only be used when test_mode is enabled in config');
    }

    console.log('🧪 Test search mode with auto-consent');
    
    // Pre-grant consent for testing
    if (options.allowDocs !== false) {
      this.consentManager.grantBulkConsent('documentation', 5); // 5 minute consent
    }
    if (options.allowGitHub) {
      this.consentManager.grantBulkConsent('github', 5); // 5 minute consent  
    }

    return await this.search(query, options);
  }

  /**
   * Update confidence thresholds
   * @param {Object} newThresholds - New threshold values
   */
  updateThresholds(newThresholds) {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    console.log('🔧 Updated confidence thresholds:', this.thresholds);
  }

  getDefaultConfig() {
    return {
      layered_retrieval: {
        confidence_thresholds: {
          memory_sufficient: 0.70,
          github_expansion: 0.30,
          documentation_minimum: 0.10
        }
      },
      github: {
        enabled: true
      },
      documentation: {
        enabled: true
      }
    };
  }
}

module.exports = LayeredRetrieval;