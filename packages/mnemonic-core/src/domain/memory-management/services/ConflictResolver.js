/**
 * ConflictResolver Domain Service - Handles conflict resolution between memory entries
 */

const ConflictResolution = require('../entities/ConflictResolution');
const Confidence = require('../value-objects/Confidence');

class ConflictResolver {
  constructor(configPath = null) {
    this.config = this.loadConfig(configPath);
    this.resolutionHistory = [];
  }

  loadConfig(configPath) {
    // Default configuration
    const defaultConfig = {
      recentProjectThresholdDays: 30,
      ageDifferenceThresholdDays: 90,
      popularityRatioThreshold: 3,
      confidenceThreshold: 0.7,
      enableAutomaticResolution: true,
      logResolutions: true
    };

    if (configPath) {
      try {
        const fs = require('fs');
        const yaml = require('js-yaml');
        const configData = yaml.load(fs.readFileSync(configPath, 'utf8'));
        return { ...defaultConfig, ...configData.conflict_resolution };
      } catch (error) {
        console.warn('Could not load conflict resolution config, using defaults:', error.message);
      }
    }

    return defaultConfig;
  }

  /**
   * Resolve conflict between project and global solutions
   */
  async resolveConflict(projectSolution, globalSolution, context = {}) {
    if (!projectSolution && !globalSolution) {
      throw new Error('At least one solution must be provided');
    }

    // If only one solution exists, no conflict
    if (!projectSolution) {
      return this.createNoConflictResult(globalSolution, 'Only global solution available');
    }

    if (!globalSolution) {
      return this.createNoConflictResult(projectSolution, 'Only project solution available');
    }

    // Apply conflict resolution strategy
    const resolution = await this.applyResolutionStrategy(projectSolution, globalSolution, context);
    
    // Log resolution if enabled
    if (this.config.logResolutions) {
      this.logResolution(resolution, context);
    }

    // Add to history
    this.resolutionHistory.push({
      resolution,
      context,
      timestamp: new Date()
    });

    return resolution;
  }

  async applyResolutionStrategy(projectSolution, globalSolution, context) {
    const strategies = [
      this.checkRecentProjectPriority.bind(this),
      this.checkNewerSolution.bind(this),
      this.checkPopularityBased.bind(this),
      this.checkConfidenceBased.bind(this),
      this.applyDefaultLocalPreference.bind(this)
    ];

    for (const strategy of strategies) {
      const result = await strategy(projectSolution, globalSolution, context);
      if (result) {
        return result;
      }
    }

    // Fallback to default
    return ConflictResolution.createDefaultLocalPreference(projectSolution, globalSolution, context);
  }

  async checkRecentProjectPriority(projectSolution, globalSolution, context) {
    const projectAge = this.calculateAge(projectSolution.createdAt);
    
    if (projectAge <= this.config.recentProjectThresholdDays) {
      return ConflictResolution.createRecentProjectPriority(projectSolution, globalSolution, {
        ...context,
        projectAge,
        threshold: this.config.recentProjectThresholdDays
      });
    }

    return null;
  }

  async checkNewerSolution(projectSolution, globalSolution, context) {
    const projectAge = this.calculateAge(projectSolution.createdAt);
    const globalAge = this.calculateAge(globalSolution.createdAt);
    const ageDifference = Math.abs(projectAge - globalAge);

    if (ageDifference > this.config.ageDifferenceThresholdDays) {
      return ConflictResolution.createNewerSolution(projectSolution, globalSolution, {
        ...context,
        projectAge,
        globalAge,
        ageDifference,
        threshold: this.config.ageDifferenceThresholdDays
      });
    }

    return null;
  }

  async checkPopularityBased(projectSolution, globalSolution, context) {
    const projectUseCount = projectSolution.useCount || 0;
    const globalUseCount = globalSolution.useCount || 0;

    if (projectUseCount === 0 && globalUseCount === 0) {
      return null; // No usage data available
    }

    const ratio = Math.max(projectUseCount, globalUseCount) / Math.max(Math.min(projectUseCount, globalUseCount), 1);

    if (ratio >= this.config.popularityRatioThreshold) {
      return ConflictResolution.createPopularityBased(projectSolution, globalSolution, {
        ...context,
        projectUseCount,
        globalUseCount,
        ratio,
        threshold: this.config.popularityRatioThreshold
      });
    }

    return null;
  }

  async checkConfidenceBased(projectSolution, globalSolution, context) {
    const projectConfidence = projectSolution.confidence?.score || 0;
    const globalConfidence = globalSolution.confidence?.score || 0;

    const confidenceDifference = Math.abs(projectConfidence - globalConfidence);
    
    if (confidenceDifference >= 0.2) { // Significant difference
      return ConflictResolution.createConfidenceBased(projectSolution, globalSolution, {
        ...context,
        projectConfidence,
        globalConfidence,
        confidenceDifference
      });
    }

    return null;
  }

  async applyDefaultLocalPreference(projectSolution, globalSolution, context) {
    return ConflictResolution.createDefaultLocalPreference(projectSolution, globalSolution, context);
  }

  createNoConflictResult(solution, reason) {
    return {
      resolution: null,
      chosenSolution: solution,
      reason,
      hasConflict: false,
      timestamp: new Date()
    };
  }

  calculateAge(date) {
    const now = new Date();
    const diffTime = Math.abs(now - new Date(date));
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  logResolution(resolution, context) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      strategy: resolution.strategy,
      reason: resolution.reason,
      context: context,
      chosenSolution: {
        id: resolution.chosenSolution.id,
        source: resolution.chosenSolution.source
      }
    };

    console.log('[ConflictResolver]', JSON.stringify(logEntry, null, 2));
  }

  // Analytics and reporting
  getResolutionStats() {
    const stats = {
      total: this.resolutionHistory.length,
      byStrategy: {},
      averageResolutionTime: 0,
      recentResolutions: this.resolutionHistory.slice(-10)
    };

    // Calculate strategy distribution
    this.resolutionHistory.forEach(({ resolution }) => {
      const strategy = resolution.strategy;
      stats.byStrategy[strategy] = (stats.byStrategy[strategy] || 0) + 1;
    });

    return stats;
  }

  clearHistory() {
    this.resolutionHistory = [];
  }

  // Configuration management
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  getConfig() {
    return { ...this.config };
  }
}

module.exports = ConflictResolver;