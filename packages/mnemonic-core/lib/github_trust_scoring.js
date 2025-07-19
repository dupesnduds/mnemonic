/**
 * GitHub Trust Scoring System for Brains Memory
 * Implements weighted trust scoring for GitHub repositories and code snippets
 */

const fs = require('fs');
const yaml = require('js-yaml');

class GitHubTrustScoring {
  constructor(configPath = './brains-config.yaml') {
    this.configPath = configPath;
    this.config = this.loadConfig();
    this.trustCache = new Map();
    this.trustCacheExpiry = new Map();
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
   * Calculate trust score for a GitHub repository
   * @param {Object} repoData - Repository data from GitHub API
   * @returns {Object} Trust score and breakdown
   */
  calculateRepositoryTrustScore(repoData) {
    const trustConfig = this.config.github?.trust_scoring;
    if (!trustConfig?.enabled) {
      return { score: trustConfig?.default_weight || 0.3, breakdown: { reason: 'trust_scoring_disabled' } };
    }

    const breakdown = {
      base_score: 0,
      organization_bonus: 0,
      repository_bonus: 0,
      dynamic_factors: {},
      penalties: {},
      final_score: 0
    };

    // Start with default weight
    let score = trustConfig.default_weight || 0.3;
    breakdown.base_score = score;

    // Organization-based trust
    const orgName = repoData.owner?.login?.toLowerCase();
    if (orgName && trustConfig.organizations?.[orgName]) {
      const orgBonus = trustConfig.organizations[orgName] - score;
      score = trustConfig.organizations[orgName];
      breakdown.organization_bonus = orgBonus;
    }

    // Repository-specific trust
    const repoFullName = repoData.full_name?.toLowerCase();
    if (repoFullName && trustConfig.repositories?.[repoFullName]) {
      const repoBonus = trustConfig.repositories[repoFullName] - score;
      score = trustConfig.repositories[repoFullName];
      breakdown.repository_bonus = repoBonus;
    }

    // Dynamic trust factors
    if (trustConfig.factors) {
      const dynamicAdjustment = this.calculateDynamicTrustFactors(repoData, trustConfig.factors);
      score = Math.min(1.0, score + dynamicAdjustment.total_adjustment);
      breakdown.dynamic_factors = dynamicAdjustment;
    }

    // Apply penalties for risk factors
    const penalties = this.calculateTrustPenalties(repoData);
    score = Math.max(0.1, score - penalties.total_penalty);
    breakdown.penalties = penalties;

    breakdown.final_score = Math.round(score * 100) / 100;

    return {
      score: breakdown.final_score,
      breakdown: breakdown,
      cached: false,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Calculate dynamic trust factors based on repository metrics
   * @param {Object} repoData - Repository data from GitHub API
   * @param {Object} factors - Factor weights from configuration
   * @returns {Object} Dynamic adjustment calculation
   */
  calculateDynamicTrustFactors(repoData, factors) {
    const adjustment = {
      stars_adjustment: 0,
      forks_adjustment: 0,
      activity_adjustment: 0,
      maintainer_adjustment: 0,
      total_adjustment: 0
    };

    // Stars influence
    if (repoData.stargazers_count && factors.stars_weight) {
      const minStars = factors.min_stars || 100;
      const starsRatio = Math.min(repoData.stargazers_count / minStars, 3); // Cap at 3x minimum
      adjustment.stars_adjustment = (starsRatio - 1) * factors.stars_weight * 0.1;
    }

    // Forks influence
    if (repoData.forks_count && factors.forks_weight) {
      const minForks = factors.min_forks || 50;
      const forksRatio = Math.min(repoData.forks_count / minForks, 3); // Cap at 3x minimum
      adjustment.forks_adjustment = (forksRatio - 1) * factors.forks_weight * 0.1;
    }

    // Recent activity influence
    if (repoData.updated_at && factors.recent_activity_weight) {
      const lastUpdate = new Date(repoData.updated_at);
      const monthsOld = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24 * 30);
      const maxAge = factors.max_age_months || 24;
      
      if (monthsOld <= maxAge) {
        const activityFactor = 1 - (monthsOld / maxAge);
        adjustment.activity_adjustment = activityFactor * factors.recent_activity_weight * 0.1;
      } else {
        adjustment.activity_adjustment = -0.05; // Penalty for very old repos
      }
    }

    // Maintainer influence (simplified - could be enhanced with actual maintainer data)
    if (factors.maintainer_weight) {
      // For now, use organization membership as a proxy for maintainer quality
      const knownOrgs = ['microsoft', 'google', 'facebook', 'nodejs', 'reactjs', 'vuejs', 'angular'];
      const ownerLogin = repoData.owner?.login?.toLowerCase();
      
      if (knownOrgs.includes(ownerLogin)) {
        adjustment.maintainer_adjustment = factors.maintainer_weight * 0.1;
      }
    }

    // Calculate total adjustment
    adjustment.total_adjustment = 
      adjustment.stars_adjustment +
      adjustment.forks_adjustment +
      adjustment.activity_adjustment +
      adjustment.maintainer_adjustment;

    // Round adjustments for readability
    Object.keys(adjustment).forEach(key => {
      adjustment[key] = Math.round(adjustment[key] * 100) / 100;
    });

    return adjustment;
  }

  /**
   * Calculate trust penalties for risk factors
   * @param {Object} repoData - Repository data from GitHub API
   * @returns {Object} Penalty calculation
   */
  calculateTrustPenalties(repoData) {
    const penalties = {
      archived_penalty: 0,
      fork_penalty: 0,
      low_activity_penalty: 0,
      security_penalty: 0,
      total_penalty: 0
    };

    // Archived repository penalty
    if (repoData.archived) {
      penalties.archived_penalty = 0.3;
    }

    // Fork penalty (lower trust for forks vs original repos)
    if (repoData.fork) {
      penalties.fork_penalty = 0.1;
    }

    // Low activity penalty
    if (repoData.updated_at) {
      const lastUpdate = new Date(repoData.updated_at);
      const yearsOld = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24 * 365);
      
      if (yearsOld > 3) {
        penalties.low_activity_penalty = Math.min(0.2, yearsOld * 0.05);
      }
    }

    // Security penalty (if we detect security issues - simplified)
    if (repoData.has_issues === false && repoData.open_issues_count === 0) {
      // Suspicious if a repo has no way to report issues
      penalties.security_penalty = 0.05;
    }

    penalties.total_penalty = 
      penalties.archived_penalty +
      penalties.fork_penalty +
      penalties.low_activity_penalty +
      penalties.security_penalty;

    return penalties;
  }

  /**
   * Score a code snippet from a GitHub file
   * @param {Object} fileData - File data from GitHub API
   * @param {Object} repoTrustScore - Repository trust score
   * @param {string} codeSnippet - The actual code snippet
   * @returns {Object} Code snippet trust score
   */
  scoreCodeSnippet(fileData, repoTrustScore, codeSnippet) {
    let score = repoTrustScore.score;
    const breakdown = {
      repository_score: repoTrustScore.score,
      file_adjustments: {},
      code_adjustments: {},
      final_score: 0
    };

    // File-specific adjustments
    const fileAdjustments = this.calculateFileAdjustments(fileData);
    score += fileAdjustments.total_adjustment;
    breakdown.file_adjustments = fileAdjustments;

    // Code snippet quality adjustments
    const codeAdjustments = this.calculateCodeQualityAdjustments(codeSnippet);
    score += codeAdjustments.total_adjustment;
    breakdown.code_adjustments = codeAdjustments;

    // Ensure score stays within bounds
    score = Math.max(0.1, Math.min(1.0, score));
    breakdown.final_score = Math.round(score * 100) / 100;

    return {
      score: breakdown.final_score,
      breakdown: breakdown,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Calculate file-specific trust adjustments
   * @param {Object} fileData - File data from GitHub API
   * @returns {Object} File adjustment calculation
   */
  calculateFileAdjustments(fileData) {
    const adjustments = {
      path_adjustment: 0,
      size_adjustment: 0,
      type_adjustment: 0,
      total_adjustment: 0
    };

    // Path-based adjustments
    const filePath = fileData.path?.toLowerCase() || '';
    if (filePath.includes('test') || filePath.includes('spec')) {
      adjustments.path_adjustment = 0.05; // Tests are usually well-written
    } else if (filePath.includes('example') || filePath.includes('demo')) {
      adjustments.path_adjustment = 0.03; // Examples are educational
    } else if (filePath.includes('build') || filePath.includes('dist')) {
      adjustments.path_adjustment = -0.1; // Avoid build artifacts
    }

    // File size adjustments
    const fileSize = fileData.size || 0;
    if (fileSize > 0) {
      if (fileSize < 1000) {
        adjustments.size_adjustment = 0.02; // Small files often have focused examples
      } else if (fileSize > 10000) {
        adjustments.size_adjustment = -0.05; // Very large files might be less focused
      }
    }

    // File type adjustments
    const fileName = fileData.name?.toLowerCase() || '';
    if (fileName.endsWith('.md') || fileName.endsWith('.mdx')) {
      adjustments.type_adjustment = 0.03; // Documentation is valuable
    } else if (fileName.endsWith('.json') || fileName.endsWith('.xml')) {
      adjustments.type_adjustment = -0.02; // Configuration files less useful for learning
    }

    adjustments.total_adjustment = 
      adjustments.path_adjustment +
      adjustments.size_adjustment +
      adjustments.type_adjustment;

    return adjustments;
  }

  /**
   * Calculate code quality adjustments based on snippet content
   * @param {string} codeSnippet - The code snippet to analyze
   * @returns {Object} Code quality adjustment calculation
   */
  calculateCodeQualityAdjustments(codeSnippet) {
    const adjustments = {
      comment_adjustment: 0,
      error_handling_adjustment: 0,
      modern_syntax_adjustment: 0,
      test_code_adjustment: 0,
      total_adjustment: 0
    };

    if (!codeSnippet || typeof codeSnippet !== 'string') {
      return adjustments;
    }

    const lines = codeSnippet.split('\n');
    const totalLines = lines.length;

    // Comment density adjustment
    const commentLines = lines.filter(line => 
      line.trim().startsWith('//') || 
      line.trim().startsWith('/*') || 
      line.trim().startsWith('*') ||
      line.trim().startsWith('#')
    ).length;
    
    if (totalLines > 0) {
      const commentRatio = commentLines / totalLines;
      if (commentRatio > 0.1 && commentRatio < 0.5) {
        adjustments.comment_adjustment = 0.05; // Good comment density
      }
    }

    // Error handling patterns
    const errorHandlingPatterns = [
      /try\s*{/i, /catch\s*\(/i, /throw\s+/i, /error/i, /exception/i,
      /\.catch\(/i, /await.*try/i, /promise.*reject/i
    ];
    
    const hasErrorHandling = errorHandlingPatterns.some(pattern => pattern.test(codeSnippet));
    if (hasErrorHandling) {
      adjustments.error_handling_adjustment = 0.03;
    }

    // Modern syntax patterns (ES6+, TypeScript)
    const modernPatterns = [
      /const\s+/i, /let\s+/i, /=>/i, /async\s+/i, /await\s+/i,
      /import\s+/i, /export\s+/i, /interface\s+/i, /type\s+.*=/i
    ];
    
    const modernSyntaxCount = modernPatterns.filter(pattern => pattern.test(codeSnippet)).length;
    if (modernSyntaxCount >= 2) {
      adjustments.modern_syntax_adjustment = 0.02;
    }

    // Test code patterns
    const testPatterns = [
      /describe\s*\(/i, /it\s*\(/i, /test\s*\(/i, /expect\s*\(/i,
      /assert/i, /should/i, /\.toBe/i, /\.toEqual/i
    ];
    
    const hasTestCode = testPatterns.some(pattern => pattern.test(codeSnippet));
    if (hasTestCode) {
      adjustments.test_code_adjustment = 0.04; // Test code is valuable for learning
    }

    adjustments.total_adjustment = 
      adjustments.comment_adjustment +
      adjustments.error_handling_adjustment +
      adjustments.modern_syntax_adjustment +
      adjustments.test_code_adjustment;

    return adjustments;
  }

  /**
   * Get cached trust score or calculate new one
   * @param {string} repoFullName - Full repository name (owner/repo)
   * @param {Object} repoData - Repository data from GitHub API
   * @returns {Object} Trust score result
   */
  getTrustScore(repoFullName, repoData = null) {
    // Check cache first
    const cacheKey = repoFullName.toLowerCase();
    const cachedScore = this.trustCache.get(cacheKey);
    const cacheExpiry = this.trustCacheExpiry.get(cacheKey);

    if (cachedScore && cacheExpiry && Date.now() < cacheExpiry) {
      return { ...cachedScore, cached: true };
    }

    // Calculate new score
    if (!repoData) {
      // If no repo data provided, use minimal trust score
      return {
        score: this.config.github?.trust_scoring?.default_weight || 0.3,
        breakdown: { reason: 'no_repo_data' },
        cached: false
      };
    }

    const trustScore = this.calculateRepositoryTrustScore(repoData);

    // Cache the result for 6 hours
    const cacheExpiryTime = Date.now() + (6 * 60 * 60 * 1000);
    this.trustCache.set(cacheKey, trustScore);
    this.trustCacheExpiry.set(cacheKey, cacheExpiryTime);

    return trustScore;
  }

  /**
   * Rank search results by trust score
   * @param {Array} searchResults - Array of search results with repository data
   * @returns {Array} Ranked results with trust scores
   */
  rankResultsByTrust(searchResults) {
    return searchResults.map(result => {
      const trustScore = this.getTrustScore(result.repository?.full_name, result.repository);
      
      return {
        ...result,
        trust_score: trustScore.score,
        trust_breakdown: trustScore.breakdown,
        weighted_relevance: result.relevance_score * trustScore.score
      };
    }).sort((a, b) => b.weighted_relevance - a.weighted_relevance);
  }

  /**
   * Clear trust score cache
   */
  clearCache() {
    this.trustCache.clear();
    this.trustCacheExpiry.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    const now = Date.now();
    const validEntries = Array.from(this.trustCacheExpiry.values()).filter(expiry => expiry > now).length;
    
    return {
      total_entries: this.trustCache.size,
      valid_entries: validEntries,
      expired_entries: this.trustCache.size - validEntries,
      cache_hit_potential: validEntries / Math.max(1, this.trustCache.size)
    };
  }

  getDefaultConfig() {
    return {
      github: {
        trust_scoring: {
          enabled: true,
          default_weight: 0.3,
          organizations: {
            microsoft: 0.95,
            google: 0.95,
            facebook: 0.90,
            nodejs: 1.0,
            reactjs: 1.0
          },
          repositories: {
            "microsoft/TypeScript": 1.0,
            "facebook/react": 1.0,
            "nodejs/node": 1.0
          },
          factors: {
            stars_weight: 0.3,
            forks_weight: 0.2,
            recent_activity_weight: 0.2,
            maintainer_weight: 0.3,
            min_stars: 100,
            min_forks: 50,
            max_age_months: 24
          }
        }
      }
    };
  }
}

module.exports = GitHubTrustScoring;