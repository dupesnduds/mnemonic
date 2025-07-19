/**
 * SearchSession Entity - Manages search sessions with layered retrieval
 */

class SearchSession {
  constructor(id, query, options = {}) {
    this.id = id;
    this.query = query;
    this.options = options;
    this.startTime = new Date();
    this.endTime = null;
    this.status = 'active';
    this.layers = [];
    this.results = [];
    this.synthesizedResult = null;
    this.metadata = {};
    this.domainEvents = [];
  }

  static create(query, options = {}) {
    const id = this.generateId();
    const session = new SearchSession(id, query, options);
    
    session.raiseEvent('SearchSessionStarted', {
      sessionId: id,
      query,
      options,
      timestamp: session.startTime
    });
    
    return session;
  }

  static generateId() {
    return `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Session status management
  static STATUS = {
    ACTIVE: 'active',
    COMPLETED: 'completed',
    FAILED: 'failed',
    TIMEOUT: 'timeout',
    CANCELLED: 'cancelled'
  };

  addLayer(layer) {
    this.layers.push(layer);
    this.raiseEvent('LayerAdded', {
      sessionId: this.id,
      layerType: layer.type,
      layerOrder: this.layers.length,
      timestamp: new Date()
    });
  }

  addResult(result, layerType) {
    const enrichedResult = {
      ...result,
      layerType,
      addedAt: new Date(),
      sessionId: this.id
    };
    
    this.results.push(enrichedResult);
    
    this.raiseEvent('ResultAdded', {
      sessionId: this.id,
      layerType,
      resultId: result.id,
      confidence: result.confidence,
      timestamp: new Date()
    });
  }

  setSynthesizedResult(synthesizedResult) {
    this.synthesizedResult = synthesizedResult;
    this.raiseEvent('ResultSynthesized', {
      sessionId: this.id,
      finalConfidence: synthesizedResult.confidence,
      sourcesUsed: synthesizedResult.sources.length,
      timestamp: new Date()
    });
  }

  complete() {
    this.status = SearchSession.STATUS.COMPLETED;
    this.endTime = new Date();
    
    this.raiseEvent('SearchSessionCompleted', {
      sessionId: this.id,
      duration: this.getDuration(),
      layersUsed: this.layers.length,
      resultsFound: this.results.length,
      finalStatus: this.status,
      timestamp: this.endTime
    });
  }

  fail(reason) {
    this.status = SearchSession.STATUS.FAILED;
    this.endTime = new Date();
    this.metadata.failureReason = reason;
    
    this.raiseEvent('SearchSessionFailed', {
      sessionId: this.id,
      reason,
      duration: this.getDuration(),
      layersUsed: this.layers.length,
      timestamp: this.endTime
    });
  }

  cancel() {
    this.status = SearchSession.STATUS.CANCELLED;
    this.endTime = new Date();
    
    this.raiseEvent('SearchSessionCancelled', {
      sessionId: this.id,
      duration: this.getDuration(),
      timestamp: this.endTime
    });
  }

  timeout() {
    this.status = SearchSession.STATUS.TIMEOUT;
    this.endTime = new Date();
    
    this.raiseEvent('SearchSessionTimeout', {
      sessionId: this.id,
      duration: this.getDuration(),
      timestamp: this.endTime
    });
  }

  // Business logic methods
  getDuration() {
    const endTime = this.endTime || new Date();
    return endTime - this.startTime;
  }

  getDurationInSeconds() {
    return Math.round(this.getDuration() / 1000);
  }

  isCompleted() {
    return this.status === SearchSession.STATUS.COMPLETED;
  }

  isActive() {
    return this.status === SearchSession.STATUS.ACTIVE;
  }

  hasResults() {
    return this.results.length > 0;
  }

  getResultsCount() {
    return this.results.length;
  }

  getLayersUsed() {
    return this.layers.map(layer => layer.type);
  }

  getResultsByLayer(layerType) {
    return this.results.filter(result => result.layerType === layerType);
  }

  getHighestConfidenceResult() {
    if (this.results.length === 0) return null;
    
    return this.results.reduce((highest, current) => {
      return (current.confidence > highest.confidence) ? current : highest;
    });
  }

  getAverageConfidence() {
    if (this.results.length === 0) return 0;
    
    const total = this.results.reduce((sum, result) => sum + result.confidence, 0);
    return total / this.results.length;
  }

  // Metadata management
  setMetadata(key, value) {
    this.metadata[key] = value;
  }

  getMetadata(key) {
    return this.metadata[key];
  }

  // Event management
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

  // Analytics methods
  getPerformanceMetrics() {
    return {
      sessionId: this.id,
      duration: this.getDuration(),
      durationSeconds: this.getDurationInSeconds(),
      layersUsed: this.layers.length,
      resultsFound: this.results.length,
      averageConfidence: this.getAverageConfidence(),
      highestConfidence: this.getHighestConfidenceResult()?.confidence || 0,
      status: this.status,
      hasSynthesizedResult: !!this.synthesizedResult
    };
  }

  // Validation
  validate() {
    const errors = [];
    
    if (!this.query || this.query.trim().length === 0) {
      errors.push('Query is required');
    }
    
    if (this.query && this.query.length > 1000) {
      errors.push('Query must be 1000 characters or less');
    }
    
    return errors;
  }

  isValid() {
    return this.validate().length === 0;
  }

  toString() {
    return `SearchSession[${this.id}]: "${this.query}" (${this.status})`;
  }

  toJSON() {
    return {
      id: this.id,
      query: this.query,
      options: this.options,
      startTime: this.startTime,
      endTime: this.endTime,
      status: this.status,
      layers: this.layers,
      results: this.results,
      synthesizedResult: this.synthesizedResult,
      metadata: this.metadata,
      performance: this.getPerformanceMetrics()
    };
  }
}

module.exports = SearchSession;