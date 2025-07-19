/**
 * GitHub API Integration for Brains Memory System
 * Provides actual GitHub search capabilities with trust scoring and rate limiting
 */

const fs = require('fs');
const yaml = require('js-yaml');
const https = require('https');
const { URL } = require('url');

class GitHubIntegration {
  constructor(configPath = './brains-config.yaml') {
    this.configPath = configPath;
    this.config = this.loadConfig();
    this.trustScoring = null;
    this.retryManager = null;
    this.searchCache = new Map();
    this.apiToken = this.loadApiToken();
  }

  loadConfig() {
    try {
      return yaml.load(fs.readFileSync(this.configPath, 'utf8'));
    } catch (error) {
      console.warn('Could not load config, using defaults:', error.message);
      return this.getDefaultConfig();
    }
  }

  loadApiToken() {
    // Try multiple sources for API token
    const tokenSources = [
      process.env.GITHUB_TOKEN,
      process.env.BRAINS_GITHUB_TOKEN,
      this.config.github?.api_token
    ];

    for (const token of tokenSources) {
      if (token) {
        return token;
      }
    }

    console.warn('No GitHub API token found. Rate limiting will be more restrictive.');
    return null;
  }

  /**
   * Initialize dependencies (called by layered retrieval system)
   */
  initialize(trustScoring, retryManager) {
    this.trustScoring = trustScoring;
    this.retryManager = retryManager;
  }

  /**
   * Search GitHub repositories for code solutions
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Search results with trust scoring
   */
  async searchRepositories(query, options = {}) {
    const searchConfig = {
      maxResults: options.maxResults || 10,
      includeCode: options.includeCode !== false,
      includeDocs: options.includeDocs !== false,
      trustThreshold: options.trustThreshold || 0.1,
      language: options.language || null,
      ...options
    };

    // Check cache first
    const cacheKey = this.generateCacheKey(query, searchConfig);
    const cachedResult = this.getCachedResult(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    const searchResults = [];

    try {
      // Search repositories
      if (searchConfig.includeCode || searchConfig.includeDocs) {
        const repoResults = await this.searchGitHubRepositories(query, searchConfig);
        searchResults.push(...repoResults);
      }

      // Search code specifically
      if (searchConfig.includeCode) {
        const codeResults = await this.searchGitHubCode(query, searchConfig);
        searchResults.push(...codeResults);
      }

      // Apply trust scoring and filtering
      const scoredResults = await this.applyTrustScoring(searchResults, query);
      const filteredResults = scoredResults.filter(result => 
        result.trust_score >= searchConfig.trustThreshold
      );

      // Sort by trust score and relevance
      const sortedResults = filteredResults.sort((a, b) => {
        const scoreDiff = b.trust_score - a.trust_score;
        if (Math.abs(scoreDiff) < 0.1) {
          return b.relevance_score - a.relevance_score;
        }
        return scoreDiff;
      });

      const finalResults = {
        query: query,
        total_results: sortedResults.length,
        results: sortedResults.slice(0, searchConfig.maxResults),
        search_metadata: {
          cached: false,
          timestamp: new Date().toISOString(),
          trust_threshold: searchConfig.trustThreshold,
          api_rate_limit_remaining: this.lastRateLimitInfo?.remaining || 'unknown'
        }
      };

      // Cache the results
      this.cacheResult(cacheKey, finalResults);

      return finalResults;

    } catch (error) {
      console.error('GitHub search failed:', error.message);
      return {
        query: query,
        total_results: 0,
        results: [],
        error: error.message,
        search_metadata: {
          cached: false,
          timestamp: new Date().toISOString(),
          failed: true
        }
      };
    }
  }

  /**
   * Search GitHub repositories using the REST API
   * @param {string} query - Search query
   * @param {Object} config - Search configuration
   * @returns {Promise<Array>} Repository results
   */
  async searchGitHubRepositories(query, config) {
    const searchQuery = this.buildRepositorySearchQuery(query, config);
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(searchQuery)}&per_page=${config.maxResults}&sort=stars&order=desc`;

    const response = await this.makeGitHubRequest(url);
    this.updateRateLimitInfo(response.headers);

    return response.data.items.map(repo => ({
      type: 'repository',
      repository: {
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description,
        url: repo.html_url,
        api_url: repo.url,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        language: repo.language,
        updated_at: repo.updated_at,
        owner: {
          login: repo.owner.login,
          type: repo.owner.type,
          url: repo.owner.html_url
        }
      },
      relevance_score: this.calculateRelevanceScore(query, repo),
      trust_score: 0 // Will be calculated by trust scoring system
    }));
  }

  /**
   * Search GitHub code using the REST API
   * @param {string} query - Search query
   * @param {Object} config - Search configuration
   * @returns {Promise<Array>} Code results
   */
  async searchGitHubCode(query, config) {
    const searchQuery = this.buildCodeSearchQuery(query, config);
    const url = `https://api.github.com/search/code?q=${encodeURIComponent(searchQuery)}&per_page=${Math.min(config.maxResults, 30)}&sort=indexed&order=desc`;

    const response = await this.makeGitHubRequest(url);
    this.updateRateLimitInfo(response.headers);

    const codeResults = [];
    for (const item of response.data.items) {
      // Get file content if it's reasonably sized
      if (item.size && item.size < 10000) {
        try {
          const content = await this.getFileContent(item.url);
          codeResults.push({
            type: 'code',
            repository: {
              name: item.repository.name,
              full_name: item.repository.full_name,
              url: item.repository.html_url,
              stars: item.repository.stargazers_count,
              forks: item.repository.forks_count,
              language: item.repository.language,
              owner: {
                login: item.repository.owner.login,
                type: item.repository.owner.type
              }
            },
            file: {
              name: item.name,
              path: item.path,
              url: item.html_url,
              size: item.size,
              content: content.substring(0, 5000) // Limit content size
            },
            relevance_score: this.calculateRelevanceScore(query, item),
            trust_score: 0 // Will be calculated by trust scoring system
          });
        } catch (error) {
          console.warn(`Failed to get content for ${item.path}:`, error.message);
        }
      }
    }

    return codeResults;
  }

  /**
   * Build repository search query with filters
   * @param {string} query - Base query
   * @param {Object} config - Search configuration
   * @returns {string} GitHub search query
   */
  buildRepositorySearchQuery(query, config) {
    let searchQuery = query;

    // Add language filter
    if (config.language) {
      searchQuery += ` language:${config.language}`;
    }

    // Add quality filters
    searchQuery += ' stars:>10 forks:>5';

    // Add trusted organizations boost
    const trustedOrgs = this.config.github?.trust_scoring?.organizations || {};
    const topOrgs = Object.entries(trustedOrgs)
      .filter(([, score]) => score > 0.8)
      .map(([org]) => org)
      .slice(0, 5);

    if (topOrgs.length > 0) {
      const orgQuery = topOrgs.map(org => `user:${org}`).join(' OR ');
      searchQuery += ` (${orgQuery})`;
    }

    return searchQuery;
  }

  /**
   * Build code search query with filters
   * @param {string} query - Base query
   * @param {Object} config - Search configuration
   * @returns {string} GitHub search query
   */
  buildCodeSearchQuery(query, config) {
    let searchQuery = query;

    // Add language filter
    if (config.language) {
      searchQuery += ` language:${config.language}`;
    }

    // Add file type filters for common code files
    const codeExtensions = ['js', 'ts', 'py', 'java', 'go', 'rs', 'cpp', 'c', 'php', 'rb'];
    const extQuery = codeExtensions.map(ext => `extension:${ext}`).join(' OR ');
    searchQuery += ` (${extQuery})`;

    // Exclude common non-code files
    searchQuery += ' -filename:package-lock.json -filename:yarn.lock -path:node_modules -path:dist -path:build';

    return searchQuery;
  }

  /**
   * Make authenticated GitHub API request with retry logic
   * @param {string} url - API URL
   * @returns {Promise<Object>} API response
   */
  async makeGitHubRequest(url) {
    const operation = async () => {
      return new Promise((resolve, reject) => {
        const headers = {
          'User-Agent': 'Brains-Memory-System/1.0',
          'Accept': 'application/vnd.github.v3+json'
        };

        if (this.apiToken) {
          headers['Authorization'] = `token ${this.apiToken}`;
        }

        const parsedUrl = new URL(url);
        const options = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || 443,
          path: parsedUrl.pathname + parsedUrl.search,
          method: 'GET',
          headers: headers
        };

        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              const jsonData = JSON.parse(data);
              
              if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve({
                  data: jsonData,
                  headers: res.headers,
                  status: res.statusCode
                });
              } else {
                const error = new Error(`GitHub API error: ${res.statusCode}`);
                error.response = { status: res.statusCode, data: jsonData };
                reject(error);
              }
            } catch (parseError) {
              reject(new Error(`Failed to parse GitHub API response: ${parseError.message}`));
            }
          });
        });

        req.on('error', (error) => {
          reject(error);
        });

        req.setTimeout(30000, () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });

        req.end();
      });
    };

    // Use retry manager if available
    if (this.retryManager) {
      const result = await this.retryManager.executeWithRetry('github', operation);
      if (result.success) {
        return result.data;
      } else {
        throw result.error;
      }
    } else {
      return await operation();
    }
  }

  /**
   * Get file content from GitHub API
   * @param {string} url - File API URL
   * @returns {Promise<string>} File content
   */
  async getFileContent(url) {
    const response = await this.makeGitHubRequest(url);
    
    if (response.data.content) {
      // Content is base64 encoded
      return Buffer.from(response.data.content, 'base64').toString('utf8');
    }
    
    return '';
  }

  /**
   * Apply trust scoring to search results
   * @param {Array} results - Raw search results
   * @param {string} query - Original search query
   * @returns {Promise<Array>} Results with trust scores
   */
  async applyTrustScoring(results, query) {
    if (!this.trustScoring) {
      // Fallback trust scoring if trust scoring system not available
      return results.map(result => ({
        ...result,
        trust_score: this.calculateBasicTrustScore(result)
      }));
    }

    const scoredResults = [];
    for (const result of results) {
      try {
        const trustScore = await this.trustScoring.calculateRepositoryTrustScore(
          result.repository.owner.login,
          result.repository.name,
          {
            stars: result.repository.stars,
            forks: result.repository.forks,
            language: result.repository.language,
            updated_at: result.repository.updated_at
          }
        );

        scoredResults.push({
          ...result,
          trust_score: trustScore
        });
      } catch (error) {
        console.warn(`Trust scoring failed for ${result.repository.full_name}:`, error.message);
        scoredResults.push({
          ...result,
          trust_score: this.calculateBasicTrustScore(result)
        });
      }
    }

    return scoredResults;
  }

  /**
   * Calculate basic trust score without full trust scoring system
   * @param {Object} result - Search result
   * @returns {number} Basic trust score
   */
  calculateBasicTrustScore(result) {
    const repo = result.repository;
    let score = 0.1; // Base score

    // Organization trust boost
    const trustedOrgs = this.config.github?.trust_scoring?.organizations || {};
    const orgScore = trustedOrgs[repo.owner.login] || 0;
    score += orgScore * 0.5;

    // Stars and forks boost
    if (repo.stars > 1000) score += 0.2;
    if (repo.stars > 10000) score += 0.2;
    if (repo.forks > 100) score += 0.1;

    // Recent activity boost
    if (repo.updated_at) {
      const lastUpdate = new Date(repo.updated_at);
      const monthsAgo = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24 * 30);
      if (monthsAgo < 6) score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Calculate relevance score for search result
   * @param {string} query - Search query
   * @param {Object} item - GitHub item
   * @returns {number} Relevance score
   */
  calculateRelevanceScore(query, item) {
    let score = 0;
    const queryWords = query.toLowerCase().split(/\s+/);

    // Check name relevance
    if (item.name) {
      const nameWords = item.name.toLowerCase().split(/[-_\s]+/);
      const nameMatches = queryWords.filter(word => 
        nameWords.some(nameWord => nameWord.includes(word))
      );
      score += (nameMatches.length / queryWords.length) * 0.4;
    }

    // Check description relevance
    if (item.description) {
      const descWords = item.description.toLowerCase().split(/\s+/);
      const descMatches = queryWords.filter(word =>
        descWords.some(descWord => descWord.includes(word))
      );
      score += (descMatches.length / queryWords.length) * 0.3;
    }

    // Check path relevance (for code results)
    if (item.path) {
      const pathWords = item.path.toLowerCase().split(/[\/\-_\s]+/);
      const pathMatches = queryWords.filter(word =>
        pathWords.some(pathWord => pathWord.includes(word))
      );
      score += (pathMatches.length / queryWords.length) * 0.3;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Update rate limit information from response headers
   * @param {Object} headers - Response headers
   */
  updateRateLimitInfo(headers) {
    this.lastRateLimitInfo = {
      remaining: parseInt(headers['x-ratelimit-remaining']) || 0,
      limit: parseInt(headers['x-ratelimit-limit']) || 60,
      reset: parseInt(headers['x-ratelimit-reset']) || 0,
      used: parseInt(headers['x-ratelimit-used']) || 0
    };
  }

  /**
   * Generate cache key for search results
   * @param {string} query - Search query
   * @param {Object} config - Search configuration
   * @returns {string} Cache key
   */
  generateCacheKey(query, config) {
    const keyData = JSON.stringify({
      query: query.toLowerCase(),
      maxResults: config.maxResults,
      language: config.language,
      trustThreshold: config.trustThreshold
    });
    
    return require('crypto').createHash('sha256').update(keyData).digest('hex').substring(0, 16);
  }

  /**
   * Get cached search result
   * @param {string} cacheKey - Cache key
   * @returns {Object|null} Cached result or null
   */
  getCachedResult(cacheKey) {
    const cached = this.searchCache.get(cacheKey);
    const cacheTimeout = (this.config.github?.cache_timeout_hours || 6) * 60 * 60 * 1000;
    
    if (cached && (Date.now() - cached.cached_at) < cacheTimeout) {
      return {
        ...cached.result,
        search_metadata: {
          ...cached.result.search_metadata,
          cached: true
        }
      };
    }
    
    if (cached) {
      this.searchCache.delete(cacheKey);
    }
    
    return null;
  }

  /**
   * Cache search result
   * @param {string} cacheKey - Cache key
   * @param {Object} result - Search result
   */
  cacheResult(cacheKey, result) {
    this.searchCache.set(cacheKey, {
      result: result,
      cached_at: Date.now()
    });

    // Limit cache size
    if (this.searchCache.size > 100) {
      const oldestKey = this.searchCache.keys().next().value;
      this.searchCache.delete(oldestKey);
    }
  }

  /**
   * Get GitHub API rate limit status
   * @returns {Object} Rate limit information
   */
  getRateLimitStatus() {
    return this.lastRateLimitInfo || {
      remaining: 'unknown',
      limit: 'unknown',
      reset: 'unknown',
      used: 'unknown'
    };
  }

  /**
   * Clear search cache
   */
  clearCache() {
    this.searchCache.clear();
  }

  getDefaultConfig() {
    return {
      github: {
        enabled: true,
        cache_timeout_hours: 6,
        trust_scoring: {
          organizations: {
            microsoft: 0.95,
            facebook: 0.90,
            google: 0.90,
            nodejs: 1.0,
            reactjs: 0.95,
            vuejs: 0.90,
            angular: 0.90,
            tensorflow: 0.95,
            pytorch: 0.90,
            kubernetes: 0.95
          }
        }
      }
    };
  }
}

module.exports = GitHubIntegration;