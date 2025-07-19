/**
 * Monitoring Service - Centralized monitoring and observability
 */

// Import Prometheus metrics if available
try {
  var { register } = require('../../lib/prometheus_metrics');
} catch(e) {
  var register = require('prom-client').register;
}

class MonitoringService {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.metrics = {
      requests: new Map(),
      errors: new Map(),
      operations: new Map()
    };
    this.startTime = Date.now();
    
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Listen to application events
    this.eventBus.on('application.error', this.handleApplicationError.bind(this));
    this.eventBus.on('memory.entry.created', this.handleMemoryOperation.bind(this));
    this.eventBus.on('search.session.completed', this.handleSearchOperation.bind(this));
    this.eventBus.on('conflict.resolved', this.handleConflictResolution.bind(this));
  }

  // Request middleware for Express
  getRequestMiddleware() {
    return (req, res, next) => {
      const start = Date.now();
      
      // Track request
      this.recordRequest(req);
      
      // Override res.end to capture response metrics
      const originalEnd = res.end;
      res.end = (...args) => {
        const duration = Date.now() - start;
        this.recordResponse(req, res, duration);
        originalEnd.apply(res, args);
      };
      
      next();
    };
  }

  recordRequest(req) {
    const key = `${req.method}:${req.route?.path || req.path}`;
    
    if (!this.metrics.requests.has(key)) {
      this.metrics.requests.set(key, {
        count: 0,
        totalDuration: 0,
        errors: 0,
        lastAccess: null
      });
    }
    
    const metric = this.metrics.requests.get(key);
    metric.count++;
    metric.lastAccess = new Date();
  }

  recordResponse(req, res, duration) {
    const key = `${req.method}:${req.route?.path || req.path}`;
    const metric = this.metrics.requests.get(key);
    
    if (metric) {
      metric.totalDuration += duration;
      
      if (res.statusCode >= 400) {
        metric.errors++;
      }
    }
  }

  recordError(errorData) {
    const key = errorData.path || 'unknown';
    
    if (!this.metrics.errors.has(key)) {
      this.metrics.errors.set(key, {
        count: 0,
        lastOccurrence: null,
        errors: []
      });
    }
    
    const metric = this.metrics.errors.get(key);
    metric.count++;
    metric.lastOccurrence = new Date();
    metric.errors.push({
      message: errorData.error,
      timestamp: new Date(errorData.timestamp),
      correlationId: errorData.correlationId
    });
    
    // Keep only last 10 errors
    if (metric.errors.length > 10) {
      metric.errors.shift();
    }
  }

  recordMemoryOperation(operation, data) {
    const key = `memory.${operation}`;
    
    if (!this.metrics.operations.has(key)) {
      this.metrics.operations.set(key, {
        count: 0,
        lastOperation: null,
        categories: new Map()
      });
    }
    
    const metric = this.metrics.operations.get(key);
    metric.count++;
    metric.lastOperation = new Date();
    
    // Track by category
    if (data.category) {
      const categoryCount = metric.categories.get(data.category) || 0;
      metric.categories.set(data.category, categoryCount + 1);
    }
  }

  recordSearchOperation(data) {
    const key = 'search.session';
    
    if (!this.metrics.operations.has(key)) {
      this.metrics.operations.set(key, {
        count: 0,
        totalDuration: 0,
        averageDuration: 0,
        layersUsed: new Map(),
        confidenceDistribution: {
          low: 0,
          medium: 0,
          high: 0
        }
      });
    }
    
    const metric = this.metrics.operations.get(key);
    metric.count++;
    
    if (data.duration) {
      metric.totalDuration += data.duration;
      metric.averageDuration = metric.totalDuration / metric.count;
    }
    
    // Track layers used
    if (data.layersUsed) {
      data.layersUsed.forEach(layer => {
        const layerCount = metric.layersUsed.get(layer) || 0;
        metric.layersUsed.set(layer, layerCount + 1);
      });
    }
    
    // Track confidence distribution
    if (data.confidence) {
      if (data.confidence < 0.3) {
        metric.confidenceDistribution.low++;
      } else if (data.confidence < 0.7) {
        metric.confidenceDistribution.medium++;
      } else {
        metric.confidenceDistribution.high++;
      }
    }
  }

  recordConflictResolution(data) {
    const key = 'conflict.resolution';
    
    if (!this.metrics.operations.has(key)) {
      this.metrics.operations.set(key, {
        count: 0,
        strategies: new Map(),
        lastResolution: null
      });
    }
    
    const metric = this.metrics.operations.get(key);
    metric.count++;
    metric.lastResolution = new Date();
    
    // Track strategy usage
    if (data.strategy) {
      const strategyCount = metric.strategies.get(data.strategy) || 0;
      metric.strategies.set(data.strategy, strategyCount + 1);
    }
  }

  // Event handlers
  handleApplicationError(errorData) {
    console.log('[MonitoringService] Application error recorded:', errorData);
    this.recordError(errorData);
  }

  handleMemoryOperation(data) {
    console.log('[MonitoringService] Memory operation recorded:', data);
    this.recordMemoryOperation('entry.created', data);
  }

  handleSearchOperation(data) {
    console.log('[MonitoringService] Search operation recorded:', data);
    this.recordSearchOperation(data);
  }

  handleConflictResolution(data) {
    console.log('[MonitoringService] Conflict resolution recorded:', data);
    this.recordConflictResolution(data);
  }

  // Metrics collection
  getMetrics() {
    return {
      uptime: Date.now() - this.startTime,
      requests: this.getRequestMetrics(),
      errors: this.getErrorMetrics(),
      operations: this.getOperationMetrics(),
      system: this.getSystemMetrics()
    };
  }

  getRequestMetrics() {
    const metrics = {};
    
    this.metrics.requests.forEach((metric, key) => {
      metrics[key] = {
        count: metric.count,
        averageDuration: metric.count > 0 ? metric.totalDuration / metric.count : 0,
        errorRate: metric.count > 0 ? metric.errors / metric.count : 0,
        lastAccess: metric.lastAccess
      };
    });
    
    return metrics;
  }

  getErrorMetrics() {
    const metrics = {};
    
    this.metrics.errors.forEach((metric, key) => {
      metrics[key] = {
        count: metric.count,
        lastOccurrence: metric.lastOccurrence,
        recentErrors: metric.errors.slice(-5) // Last 5 errors
      };
    });
    
    return metrics;
  }

  getOperationMetrics() {
    const metrics = {};
    
    this.metrics.operations.forEach((metric, key) => {
      const baseMetric = {
        count: metric.count,
        lastOperation: metric.lastOperation
      };
      
      // Add specific metrics based on operation type
      if (key.startsWith('memory.')) {
        baseMetric.categories = Object.fromEntries(metric.categories);
      } else if (key === 'search.session') {
        baseMetric.averageDuration = metric.averageDuration;
        baseMetric.layersUsed = Object.fromEntries(metric.layersUsed);
        baseMetric.confidenceDistribution = metric.confidenceDistribution;
      } else if (key === 'conflict.resolution') {
        baseMetric.strategies = Object.fromEntries(metric.strategies);
      }
      
      metrics[key] = baseMetric;
    });
    
    return metrics;
  }

  getSystemMetrics() {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      memory: {
        rss: memoryUsage.rss,
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform
    };
  }

  // Prometheus metrics endpoint
  async getPrometheusMetrics() {
    try {
      return await register.metrics();
    } catch (error) {
      console.error('[MonitoringService] Error getting Prometheus metrics:', error);
      throw error;
    }
  }

  // Health check
  async healthCheck() {
    try {
      const metrics = this.getMetrics();
      const errorRate = this.calculateOverallErrorRate();
      
      return {
        status: errorRate < 0.1 ? 'healthy' : 'degraded',
        message: 'Monitoring service is operational',
        metrics: {
          uptime: `${Math.round(metrics.uptime / 1000)}s`,
          totalRequests: Object.values(metrics.requests).reduce((sum, req) => sum + req.count, 0),
          errorRate: `${Math.round(errorRate * 100)}%`,
          memoryUsage: `${Math.round(metrics.system.memory.heapUsed / 1024 / 1024)}MB`
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'Monitoring service error',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  calculateOverallErrorRate() {
    let totalRequests = 0;
    let totalErrors = 0;
    
    this.metrics.requests.forEach(metric => {
      totalRequests += metric.count;
      totalErrors += metric.errors;
    });
    
    return totalRequests > 0 ? totalErrors / totalRequests : 0;
  }

  // Cleanup
  reset() {
    this.metrics.requests.clear();
    this.metrics.errors.clear();
    this.metrics.operations.clear();
    this.startTime = Date.now();
  }
}

module.exports = MonitoringService;