/**
 * Memory Entry Entity - Core aggregate root for memory management
 */

class MemoryEntry {
  constructor(id, problem, solution, category, metadata = {}) {
    this.id = id;
    this.problem = problem;
    this.solution = solution;
    this.category = category;
    this.metadata = metadata;
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.version = 1;
    this.conflicts = [];
    this.domainEvents = [];
  }

  static create(problem, solution, category, metadata = {}) {
    const id = this.generateId();
    const entry = new MemoryEntry(id, problem, solution, category, metadata);
    entry.raiseEvent('MemoryEntryCreated', {
      id,
      problem,
      category: category.name,
      timestamp: entry.createdAt
    });
    return entry;
  }

  static generateId() {
    return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  updateSolution(newSolution, reason) {
    this.solution = newSolution;
    this.updatedAt = new Date();
    this.version++;
    
    this.raiseEvent('MemoryEntryUpdated', {
      id: this.id,
      newSolution,
      reason,
      version: this.version,
      timestamp: this.updatedAt
    });
  }

  addConflict(conflictResolution) {
    this.conflicts.push(conflictResolution);
    this.raiseEvent('ConflictDetected', {
      id: this.id,
      conflictId: conflictResolution.id,
      strategy: conflictResolution.strategy,
      timestamp: new Date()
    });
  }

  raiseEvent(eventType, eventData) {
    this.domainEvents.push({
      type: eventType,
      data: eventData,
      timestamp: new Date(),
      aggregateId: this.id
    });
  }

  clearEvents() {
    this.domainEvents = [];
  }

  getEvents() {
    return [...this.domainEvents];
  }

  // Business logic methods
  isRecentlyUpdated(daysThreshold = 30) {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - daysThreshold);
    return this.updatedAt > threshold;
  }

  hasConflicts() {
    return this.conflicts.length > 0;
  }

  getLatestConflict() {
    return this.conflicts[this.conflicts.length - 1];
  }

  // Validation
  validate() {
    const errors = [];
    
    if (!this.problem || this.problem.trim().length === 0) {
      errors.push('Problem description is required');
    }
    
    if (!this.solution || this.solution.trim().length === 0) {
      errors.push('Solution is required');
    }
    
    if (!this.category || !this.category.isValid()) {
      errors.push('Valid category is required');
    }
    
    return errors;
  }

  isValid() {
    return this.validate().length === 0;
  }
}

module.exports = MemoryEntry;