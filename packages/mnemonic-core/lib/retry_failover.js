/**
 * Retry Strategy and Graceful Failover System for Brains Memory
 * Handles API failures, rate limiting, and provides resilient external service access
 */

const fs = require('fs');
const yaml = require('js-yaml');

class RetryFailoverManager {
  constructor(configPath = './brains-config.yaml') {
    this.configPath = configPath;
    this.config = this.loadConfig();
    this.circuitBreakers = new Map();
    this.retryQueues = new Map();
    this.failureLog = [];
    this.rateLimitTrackers = new Map();
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
   * Execute a function with retry logic and circuit breaker protection
   * @param {string} serviceKey - Unique identifier for the service
   * @param {Function} operation - The operation to execute
   * @param {Object} options - Retry options
   * @returns {Promise} Operation result or failure information
   */
  async executeWithRetry(serviceKey, operation, options = {}) {
    const retryConfig = this.getRetryConfig(serviceKey, options);
    const circuitBreaker = this.getCircuitBreaker(serviceKey);

    // Check circuit breaker state
    if (circuitBreaker.isOpen()) {
      return this.handleCircuitBreakerOpen(serviceKey, circuitBreaker);
    }

    // Check rate limiting
    const rateLimitCheck = this.checkRateLimit(serviceKey);
    if (!rateLimitCheck.allowed) {
      return this.handleRateLimitExceeded(serviceKey, rateLimitCheck);
    }

    let lastError = null;
    let attempt = 0;

    while (attempt <= retryConfig.maxRetries) {
      try {
        attempt++;
        
        // Add jitter to prevent thundering herd
        if (attempt > 1) {
          const delay = this.calculateRetryDelay(attempt - 1, retryConfig);
          await this.sleep(delay);
        }

        this.logAttempt(serviceKey, attempt, retryConfig.maxRetries + 1);

        const result = await operation();
        
        // Success - reset circuit breaker and update rate limiting
        circuitBreaker.recordSuccess();
        this.updateRateLimit(serviceKey, true);
        
        return {
          success: true,
          data: result,
          attempt: attempt,
          service: serviceKey
        };

      } catch (error) {
        lastError = error;
        
        // Record failure
        circuitBreaker.recordFailure();
        this.updateRateLimit(serviceKey, false);
        this.logFailure(serviceKey, attempt, error);

        // Check if we should retry based on error type
        if (!this.shouldRetry(error, attempt, retryConfig)) {
          break;
        }
      }
    }

    // All retries exhausted
    const failureResult = {
      success: false,
      error: lastError,
      attempts: attempt,
      service: serviceKey,
      circuitBreakerOpen: circuitBreaker.isOpen(),
      suggestedAction: this.getSuggestedAction(serviceKey, lastError)
    };

    // Check if we should queue for later retry
    if (retryConfig.enableQueue && this.shouldQueue(lastError)) {
      await this.queueForRetry(serviceKey, operation, options);
      failureResult.queued = true;
    }

    return failureResult;
  }

  /**
   * Get retry configuration for a specific service
   * @param {string} serviceKey - Service identifier
   * @param {Object} options - Override options
   * @returns {Object} Retry configuration
   */
  getRetryConfig(serviceKey, options) {
    const defaultConfig = {
      maxRetries: 3,
      exponentialBase: 2,
      maxDelay: 30000,
      jitterFactor: 0.1,
      enableQueue: true,
      retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'rate_limit']
    };

    // Service-specific overrides
    const serviceConfig = this.config[serviceKey]?.rate_limiting || {};
    
    return {
      ...defaultConfig,
      ...serviceConfig,
      ...options
    };
  }

  /**
   * Get or create circuit breaker for a service
   * @param {string} serviceKey - Service identifier
   * @returns {Object} Circuit breaker instance
   */
  getCircuitBreaker(serviceKey) {
    if (!this.circuitBreakers.has(serviceKey)) {
      const config = this.config[serviceKey]?.rate_limiting || {};
      const threshold = config.circuit_breaker_threshold || 5;
      const timeout = (config.circuit_breaker_timeout_minutes || 10) * 60 * 1000;

      this.circuitBreakers.set(serviceKey, new CircuitBreaker(threshold, timeout));
    }

    return this.circuitBreakers.get(serviceKey);
  }

  /**
   * Check if request is within rate limits
   * @param {string} serviceKey - Service identifier
   * @returns {Object} Rate limit check result
   */
  checkRateLimit(serviceKey) {
    const config = this.config[serviceKey]?.rate_limiting || {};
    const requestsPerHour = config.requests_per_hour || 100;
    const burstRequests = config.burst_requests || 10;

    if (!this.rateLimitTrackers.has(serviceKey)) {
      this.rateLimitTrackers.set(serviceKey, {
        hourlyRequests: [],
        burstRequests: [],
        hourlyLimit: requestsPerHour,
        burstLimit: burstRequests
      });
    }

    const tracker = this.rateLimitTrackers.get(serviceKey);
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const oneMinuteAgo = now - (60 * 1000);

    // Clean old requests
    tracker.hourlyRequests = tracker.hourlyRequests.filter(time => time > oneHourAgo);
    tracker.burstRequests = tracker.burstRequests.filter(time => time > oneMinuteAgo);

    // Check limits
    const hourlyAllowed = tracker.hourlyRequests.length < tracker.hourlyLimit;
    const burstAllowed = tracker.burstRequests.length < tracker.burstLimit;

    return {
      allowed: hourlyAllowed && burstAllowed,
      hourlyRemaining: tracker.hourlyLimit - tracker.hourlyRequests.length,
      burstRemaining: tracker.burstLimit - tracker.burstRequests.length,
      resetTime: oneHourAgo + (60 * 60 * 1000)
    };
  }

  /**
   * Update rate limit tracking after request
   * @param {string} serviceKey - Service identifier
   * @param {boolean} success - Whether request was successful
   */
  updateRateLimit(serviceKey, success) {
    const tracker = this.rateLimitTrackers.get(serviceKey);
    if (tracker) {
      const now = Date.now();
      tracker.hourlyRequests.push(now);
      tracker.burstRequests.push(now);
    }
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   * @param {number} attempt - Current retry attempt (0-based)
   * @param {Object} config - Retry configuration
   * @returns {number} Delay in milliseconds
   */
  calculateRetryDelay(attempt, config) {
    const exponentialDelay = Math.pow(config.exponentialBase, attempt) * 1000;
    const jitter = exponentialDelay * config.jitterFactor * Math.random();
    const totalDelay = exponentialDelay + jitter;
    
    return Math.min(totalDelay, config.maxDelay);
  }

  /**
   * Determine if error should trigger a retry
   * @param {Error} error - The error that occurred
   * @param {number} attempt - Current attempt number
   * @param {Object} config - Retry configuration
   * @returns {boolean} Whether to retry
   */
  shouldRetry(error, attempt, config) {
    if (attempt >= config.maxRetries + 1) {
      return false;
    }

    // Check if error type is retryable
    const errorCode = error.code || error.name || error.message;
    const isRetryableError = config.retryableErrors.some(retryableError => 
      errorCode.includes(retryableError)
    );

    // Special handling for HTTP errors
    if (error.response) {
      const status = error.response.status;
      // Retry on 429 (rate limit), 500, 502, 503, 504
      const retryableHttpCodes = [429, 500, 502, 503, 504];
      if (retryableHttpCodes.includes(status)) {
        return true;
      }
    }

    return isRetryableError;
  }

  /**
   * Handle circuit breaker open state
   * @param {string} serviceKey - Service identifier
   * @param {Object} circuitBreaker - Circuit breaker instance
   * @returns {Object} Failure result
   */
  handleCircuitBreakerOpen(serviceKey, circuitBreaker) {
    return {
      success: false,
      error: new Error('Circuit breaker is open'),
      circuitBreakerOpen: true,
      service: serviceKey,
      resetTime: circuitBreaker.resetTime,
      suggestedAction: `Service ${serviceKey} is temporarily unavailable. Circuit breaker will reset at ${new Date(circuitBreaker.resetTime).toISOString()}`
    };
  }

  /**
   * Handle rate limit exceeded
   * @param {string} serviceKey - Service identifier
   * @param {Object} rateLimitInfo - Rate limit information
   * @returns {Object} Failure result
   */
  handleRateLimitExceeded(serviceKey, rateLimitInfo) {
    return {
      success: false,
      error: new Error('Rate limit exceeded'),
      rateLimitExceeded: true,
      service: serviceKey,
      resetTime: rateLimitInfo.resetTime,
      remaining: rateLimitInfo.hourlyRemaining,
      suggestedAction: `Rate limit exceeded for ${serviceKey}. ${rateLimitInfo.hourlyRemaining} requests remaining this hour.`
    };
  }

  /**
   * Queue operation for later retry
   * @param {string} serviceKey - Service identifier
   * @param {Function} operation - Operation to queue
   * @param {Object} options - Retry options
   */
  async queueForRetry(serviceKey, operation, options) {
    if (!this.retryQueues.has(serviceKey)) {
      this.retryQueues.set(serviceKey, []);
    }

    const queue = this.retryQueues.get(serviceKey);
    const queueItem = {
      operation: operation,
      options: options,
      queuedAt: Date.now(),
      attempts: 0
    };

    queue.push(queueItem);

    // Limit queue size
    const maxQueueSize = this.config.performance?.limits?.request_queue_size || 20;
    if (queue.length > maxQueueSize) {
      queue.shift(); // Remove oldest item
    }
  }

  /**
   * Process retry queue for a service
   * @param {string} serviceKey - Service identifier
   * @returns {Promise<Array>} Results of queued operations
   */
  async processRetryQueue(serviceKey) {
    const queue = this.retryQueues.get(serviceKey);
    if (!queue || queue.length === 0) {
      return [];
    }

    const results = [];
    const maxConcurrent = this.config.performance?.concurrency?.max_concurrent_github_requests || 3;
    
    // Process queue in batches to avoid overwhelming the service
    for (let i = 0; i < queue.length; i += maxConcurrent) {
      const batch = queue.slice(i, i + maxConcurrent);
      
      const batchPromises = batch.map(async (item) => {
        try {
          const result = await this.executeWithRetry(
            serviceKey, 
            item.operation, 
            { ...item.options, enableQueue: false } // Prevent infinite queueing
          );
          return { success: true, result: result };
        } catch (error) {
          return { success: false, error: error };
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults);

      // Remove processed items from queue
      queue.splice(0, batch.length);
    }

    return results;
  }

  /**
   * Determine if operation should be queued based on error
   * @param {Error} error - The error that occurred
   * @returns {boolean} Whether to queue for retry
   */
  shouldQueue(error) {
    // Queue for rate limit errors and temporary network issues
    const queueableErrors = ['rate_limit', 'ECONNRESET', 'ETIMEDOUT'];
    const errorCode = error.code || error.name || error.message;
    
    return queueableErrors.some(queueableError => 
      errorCode.includes(queueableError)
    );
  }

  /**
   * Get suggested action for handling failure
   * @param {string} serviceKey - Service identifier
   * @param {Error} error - The error that occurred
   * @returns {string} Suggested action
   */
  getSuggestedAction(serviceKey, error) {
    const errorCode = error.code || error.name || error.message;

    if (errorCode.includes('rate_limit') || errorCode.includes('429')) {
      return `Rate limit exceeded for ${serviceKey}. Wait before retrying or use queued retry.`;
    }

    if (errorCode.includes('ENOTFOUND') || errorCode.includes('ECONNREFUSED')) {
      return `Network connectivity issue with ${serviceKey}. Check internet connection and service status.`;
    }

    if (errorCode.includes('401') || errorCode.includes('403')) {
      return `Authentication issue with ${serviceKey}. Check API credentials and permissions.`;
    }

    if (errorCode.includes('500') || errorCode.includes('502') || errorCode.includes('503')) {
      return `${serviceKey} service is experiencing issues. Try again later or check service status.`;
    }

    return `${serviceKey} operation failed. Check error details and retry if appropriate.`;
  }

  /**
   * Log retry attempt
   * @param {string} serviceKey - Service identifier
   * @param {number} attempt - Current attempt number
   * @param {number} totalAttempts - Total attempts allowed
   */
  logAttempt(serviceKey, attempt, totalAttempts) {
    if (this.config.development?.verbose_logging) {
      console.log(`🔄 ${serviceKey}: Attempt ${attempt}/${totalAttempts}`);
    }
  }

  /**
   * Log failure for analysis
   * @param {string} serviceKey - Service identifier
   * @param {number} attempt - Attempt number
   * @param {Error} error - Error that occurred
   */
  logFailure(serviceKey, attempt, error) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      service: serviceKey,
      attempt: attempt,
      error: {
        code: error.code,
        message: error.message,
        status: error.response?.status
      }
    };

    this.failureLog.push(logEntry);

    // Keep only recent failures
    if (this.failureLog.length > 1000) {
      this.failureLog = this.failureLog.slice(-1000);
    }

    // Log to audit system if enabled
    if (this.config.monitoring?.audit?.log_external_calls) {
      console.warn(`⚠️  ${serviceKey} failure on attempt ${attempt}:`, error.message);
    }
  }

  /**
   * Get failure statistics for monitoring
   * @returns {Object} Failure statistics
   */
  getFailureStats() {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const oneDayAgo = now - (24 * 60 * 60 * 1000);

    const recentFailures = this.failureLog.filter(entry => 
      new Date(entry.timestamp).getTime() > oneHourAgo
    );

    const dailyFailures = this.failureLog.filter(entry =>
      new Date(entry.timestamp).getTime() > oneDayAgo
    );

    const serviceBreakdown = {};
    recentFailures.forEach(failure => {
      if (!serviceBreakdown[failure.service]) {
        serviceBreakdown[failure.service] = 0;
      }
      serviceBreakdown[failure.service]++;
    });

    return {
      total_failures_last_hour: recentFailures.length,
      total_failures_last_24h: dailyFailures.length,
      service_breakdown: serviceBreakdown,
      circuit_breaker_status: this.getCircuitBreakerStatus(),
      queue_status: this.getQueueStatus()
    };
  }

  /**
   * Get circuit breaker status for all services
   * @returns {Object} Circuit breaker status
   */
  getCircuitBreakerStatus() {
    const status = {};
    
    for (const [service, breaker] of this.circuitBreakers.entries()) {
      status[service] = {
        is_open: breaker.isOpen(),
        failure_count: breaker.failureCount,
        reset_time: breaker.resetTime,
        last_failure: breaker.lastFailureTime
      };
    }

    return status;
  }

  /**
   * Get queue status for all services
   * @returns {Object} Queue status
   */
  getQueueStatus() {
    const status = {};
    
    for (const [service, queue] of this.retryQueues.entries()) {
      status[service] = {
        queued_items: queue.length,
        oldest_item_age: queue.length > 0 ? 
          Date.now() - queue[0].queuedAt : null
      };
    }

    return status;
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Promise that resolves after delay
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getDefaultConfig() {
    return {
      github: {
        rate_limiting: {
          requests_per_hour: 100,
          burst_requests: 10,
          retry_exponential_base: 2,
          max_retries: 3,
          circuit_breaker_threshold: 5,
          circuit_breaker_timeout_minutes: 10
        }
      },
      performance: {
        concurrency: {
          max_concurrent_github_requests: 3
        },
        limits: {
          request_queue_size: 20
        }
      },
      monitoring: {
        audit: {
          log_external_calls: true
        }
      },
      development: {
        verbose_logging: false
      }
    };
  }
}

/**
 * Circuit Breaker implementation
 */
class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.threshold = threshold;
    this.timeout = timeout;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.resetTime = null;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }

  recordSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
    this.resetTime = null;
  }

  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.threshold && this.state === 'CLOSED') {
      this.state = 'OPEN';
      this.resetTime = Date.now() + this.timeout;
    }
  }

  isOpen() {
    if (this.state === 'OPEN' && Date.now() > this.resetTime) {
      this.state = 'HALF_OPEN';
      return false;
    }

    return this.state === 'OPEN';
  }
}

module.exports = RetryFailoverManager;