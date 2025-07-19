/**
 * ConflictResolution Entity - Handles conflicts between memory entries
 */

class ConflictResolution {
  constructor(id, strategy, reason, chosenSolution, alternativeSolutions = []) {
    this.id = id;
    this.strategy = strategy;
    this.reason = reason;
    this.chosenSolution = chosenSolution;
    this.alternativeSolutions = alternativeSolutions;
    this.resolvedAt = new Date();
    this.confidence = null;
    this.metadata = {};
  }

  static create(strategy, reason, chosenSolution, alternativeSolutions = []) {
    const id = this.generateId();
    return new ConflictResolution(id, strategy, reason, chosenSolution, alternativeSolutions);
  }

  static generateId() {
    return `conflict_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Conflict resolution strategies
  static STRATEGIES = {
    RECENT_PROJECT_PRIORITY: 'recent_project_priority',
    NEWER_SOLUTION: 'newer_solution',
    POPULARITY_BASED: 'popularity_based',
    CONFIDENCE_BASED: 'confidence_based',
    MANUAL_OVERRIDE: 'manual_override',
    DEFAULT_LOCAL_PREFERENCE: 'default_local_preference'
  };

  static createByStrategy(strategy, projectSolution, globalSolution, metadata = {}) {
    switch (strategy) {
      case this.STRATEGIES.RECENT_PROJECT_PRIORITY:
        return this.createRecentProjectPriority(projectSolution, globalSolution, metadata);
      
      case this.STRATEGIES.NEWER_SOLUTION:
        return this.createNewerSolution(projectSolution, globalSolution, metadata);
      
      case this.STRATEGIES.POPULARITY_BASED:
        return this.createPopularityBased(projectSolution, globalSolution, metadata);
      
      case this.STRATEGIES.CONFIDENCE_BASED:
        return this.createConfidenceBased(projectSolution, globalSolution, metadata);
      
      case this.STRATEGIES.DEFAULT_LOCAL_PREFERENCE:
        return this.createDefaultLocalPreference(projectSolution, globalSolution, metadata);
      
      default:
        throw new Error(`Unknown conflict resolution strategy: ${strategy}`);
    }
  }

  static createRecentProjectPriority(projectSolution, globalSolution, metadata) {
    const reason = 'Project solution prioritized due to recent updates (< 30 days)';
    const alternatives = [globalSolution];
    
    return ConflictResolution.create(
      this.STRATEGIES.RECENT_PROJECT_PRIORITY,
      reason,
      projectSolution,
      alternatives
    );
  }

  static createNewerSolution(projectSolution, globalSolution, metadata) {
    const projectAge = this.calculateAge(projectSolution.createdAt);
    const globalAge = this.calculateAge(globalSolution.createdAt);
    
    const chosen = projectAge < globalAge ? projectSolution : globalSolution;
    const alternative = projectAge < globalAge ? globalSolution : projectSolution;
    
    const ageDiff = Math.abs(projectAge - globalAge);
    const reason = `Newer solution chosen (age difference: ${ageDiff} days)`;
    
    return ConflictResolution.create(
      this.STRATEGIES.NEWER_SOLUTION,
      reason,
      chosen,
      [alternative]
    );
  }

  static createPopularityBased(projectSolution, globalSolution, metadata) {
    const projectUseCount = projectSolution.useCount || 0;
    const globalUseCount = globalSolution.useCount || 0;
    
    const chosen = projectUseCount > globalUseCount ? projectSolution : globalSolution;
    const alternative = projectUseCount > globalUseCount ? globalSolution : projectSolution;
    
    const reason = `Solution chosen based on popularity (${Math.max(projectUseCount, globalUseCount)} uses)`;
    
    return ConflictResolution.create(
      this.STRATEGIES.POPULARITY_BASED,
      reason,
      chosen,
      [alternative]
    );
  }

  static createConfidenceBased(projectSolution, globalSolution, metadata) {
    const projectConfidence = projectSolution.confidence?.score || 0;
    const globalConfidence = globalSolution.confidence?.score || 0;
    
    const chosen = projectConfidence > globalConfidence ? projectSolution : globalSolution;
    const alternative = projectConfidence > globalConfidence ? globalSolution : projectSolution;
    
    const reason = `Solution chosen based on higher confidence score (${Math.max(projectConfidence, globalConfidence)})`;
    
    return ConflictResolution.create(
      this.STRATEGIES.CONFIDENCE_BASED,
      reason,
      chosen,
      [alternative]
    );
  }

  static createDefaultLocalPreference(projectSolution, globalSolution, metadata) {
    const reason = 'Default preference for local project solution';
    
    return ConflictResolution.create(
      this.STRATEGIES.DEFAULT_LOCAL_PREFERENCE,
      reason,
      projectSolution,
      [globalSolution]
    );
  }

  static calculateAge(date) {
    const now = new Date();
    const diffTime = Math.abs(now - new Date(date));
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  // Business logic methods
  setConfidence(confidence) {
    this.confidence = confidence;
  }

  addMetadata(key, value) {
    this.metadata[key] = value;
  }

  getMetadata(key) {
    return this.metadata[key];
  }

  isManualOverride() {
    return this.strategy === ConflictResolution.STRATEGIES.MANUAL_OVERRIDE;
  }

  isAutomaticResolution() {
    return !this.isManualOverride();
  }

  getAlternativeCount() {
    return this.alternativeSolutions.length;
  }

  hasAlternatives() {
    return this.getAlternativeCount() > 0;
  }

  // Validation
  validate() {
    const errors = [];
    
    if (!this.strategy || !Object.values(ConflictResolution.STRATEGIES).includes(this.strategy)) {
      errors.push('Valid strategy is required');
    }
    
    if (!this.reason || this.reason.trim().length === 0) {
      errors.push('Reason is required');
    }
    
    if (!this.chosenSolution) {
      errors.push('Chosen solution is required');
    }
    
    return errors;
  }

  isValid() {
    return this.validate().length === 0;
  }

  toString() {
    return `ConflictResolution[${this.strategy}]: ${this.reason}`;
  }

  toJSON() {
    return {
      id: this.id,
      strategy: this.strategy,
      reason: this.reason,
      chosenSolution: this.chosenSolution,
      alternativeSolutions: this.alternativeSolutions,
      resolvedAt: this.resolvedAt,
      confidence: this.confidence,
      metadata: this.metadata
    };
  }
}

module.exports = ConflictResolution;