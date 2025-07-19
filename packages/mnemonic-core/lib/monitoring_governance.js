/**
 * Monitoring and Governance System for Enhanced Brains Memory
 * Provides comprehensive monitoring, alerting, and governance capabilities
 */

const fs = require('fs');
const yaml = require('js-yaml');
const EventEmitter = require('events');

class MonitoringGovernance extends EventEmitter {
  constructor(configPath = './brains-config.yaml') {
    super();
    this.configPath = configPath;
    this.config = this.loadConfig();
    this.metrics = new Map();
    this.alerts = new Map();
    this.auditEntries = [];
    this.startTime = Date.now();
    this.healthChecks = new Map();
    
    // Initialize monitoring
    this.initializeMonitoring();
  }

  loadConfig() {
    try {
      return yaml.load(fs.readFileSync(this.configPath, 'utf8'));
    } catch (error) {
      console.warn('Could not load config, using defaults:', error.message);
      return this.getDefaultConfig();
    }
  }

  initializeMonitoring() {
    const monitoringConfig = this.config.monitoring;
    
    if (monitoringConfig?.metrics?.enabled) {
      this.initializeMetrics();
    }
    
    if (monitoringConfig?.audit?.enabled) {
      this.initializeAuditLogging();
    }

    // Start periodic health checks
    setInterval(() => this.performHealthChecks(), 60000); // Every minute
    
    // Start periodic alert evaluation
    setInterval(() => this.evaluateAlerts(), 30000); // Every 30 seconds
  }

  initializeMetrics() {
    // Initialize core metrics
    this.setMetric('system.uptime', 0);
    this.setMetric('search.total_requests', 0);
    this.setMetric('search.memory_hits', 0);
    this.setMetric('search.github_calls', 0);
    this.setMetric('search.documentation_calls', 0);
    this.setMetric('synthesis.conflicts_detected', 0);
    this.setMetric('consent.requests', 0);
    this.setMetric('consent.granted', 0);
    this.setMetric('errors.total', 0);
    this.setMetric('performance.avg_response_time', 0);
  }

  initializeAuditLogging() {
    // Set up audit log file rotation if configured
    const auditConfig = this.config.monitoring?.audit;
    if (auditConfig?.audit_file) {
      this.auditLogFile = auditConfig.audit_file;
    }
  }

  /**
   * Record a metric value
   * @param {string} metricName - Name of the metric
   * @param {number} value - Metric value
   * @param {Object} labels - Additional labels/tags
   */
  setMetric(metricName, value, labels = {}) {
    const timestamp = Date.now();
    
    if (!this.metrics.has(metricName)) {
      this.metrics.set(metricName, {
        current_value: value,
        history: [],
        labels: labels,
        last_updated: timestamp
      });
    } else {
      const metric = this.metrics.get(metricName);
      metric.history.push({
        value: metric.current_value,
        timestamp: metric.last_updated
      });
      
      // Keep only recent history to prevent memory bloat
      if (metric.history.length > 1000) {
        metric.history = metric.history.slice(-1000);
      }
      
      metric.current_value = value;
      metric.last_updated = timestamp;
    }

    // Check if this metric triggers any alerts
    this.checkMetricAlerts(metricName, value);
  }

  /**
   * Increment a counter metric
   * @param {string} metricName - Name of the counter
   * @param {number} increment - Amount to increment (default: 1)
   * @param {Object} labels - Additional labels/tags
   */
  incrementMetric(metricName, increment = 1, labels = {}) {
    const current = this.getMetricValue(metricName) || 0;
    this.setMetric(metricName, current + increment, labels);
  }

  /**
   * Record a timing metric
   * @param {string} metricName - Name of the timing metric
   * @param {number} duration - Duration in milliseconds
   * @param {Object} labels - Additional labels/tags
   */
  recordTiming(metricName, duration, labels = {}) {
    const timingMetricName = `${metricName}.duration`;
    
    // Update average response time
    const currentAvg = this.getMetricValue(timingMetricName) || 0;
    const currentCount = this.getMetricValue(`${metricName}.count`) || 0;
    
    const newCount = currentCount + 1;
    const newAvg = (currentAvg * currentCount + duration) / newCount;
    
    this.setMetric(timingMetricName, newAvg, labels);
    this.setMetric(`${metricName}.count`, newCount, labels);
  }

  /**
   * Get current value of a metric
   * @param {string} metricName - Name of the metric
   * @returns {number|null} Current metric value
   */
  getMetricValue(metricName) {
    const metric = this.metrics.get(metricName);
    return metric ? metric.current_value : null;
  }

  /**
   * Get metric with history
   * @param {string} metricName - Name of the metric
   * @returns {Object|null} Metric data with history
   */
  getMetric(metricName) {
    return this.metrics.get(metricName) || null;
  }

  /**
   * Log audit event
   * @param {string} action - Action being audited
   * @param {Object} details - Event details
   * @param {string} severity - Severity level (info, warn, error)
   */
  auditLog(action, details = {}, severity = 'info') {
    const auditEntry = {
      timestamp: new Date().toISOString(),
      action: action,
      severity: severity,
      details: details,
      session_id: this.getSessionId(),
      source: 'brains_memory_system'
    };

    this.auditEntries.push(auditEntry);

    // Write to file if configured
    if (this.auditLogFile && this.config.monitoring?.audit?.enabled) {
      this.writeAuditLogEntry(auditEntry);
    }

    // Keep only recent audit entries in memory
    if (this.auditEntries.length > 10000) {
      this.auditEntries = this.auditEntries.slice(-10000);
    }

    // Emit event for real-time monitoring
    this.emit('audit', auditEntry);
  }

  writeAuditLogEntry(entry) {
    try {
      const logLine = JSON.stringify(entry) + '\n';
      fs.appendFileSync(this.auditLogFile, logLine);
    } catch (error) {
      console.error('Failed to write audit log entry:', error.message);
    }
  }

  /**
   * Register a health check
   * @param {string} name - Health check name
   * @param {Function} checkFunction - Function that returns health status
   * @param {number} intervalMs - Check interval in milliseconds
   */
  registerHealthCheck(name, checkFunction, intervalMs = 60000) {
    this.healthChecks.set(name, {
      check: checkFunction,
      interval: intervalMs,
      lastCheck: null,
      lastResult: null,
      lastError: null
    });
  }

  /**
   * Perform all registered health checks
   */
  async performHealthChecks() {
    const results = {};
    
    for (const [name, healthCheck] of this.healthChecks.entries()) {
      try {
        const result = await healthCheck.check();
        
        healthCheck.lastCheck = Date.now();
        healthCheck.lastResult = result;
        healthCheck.lastError = null;
        
        results[name] = {
          status: result.healthy ? 'healthy' : 'unhealthy',
          details: result.details || {},
          last_check: new Date(healthCheck.lastCheck).toISOString()
        };

        // Log unhealthy states
        if (!result.healthy) {
          this.auditLog('health_check_failed', {
            check_name: name,
            details: result.details
          }, 'warn');
        }

      } catch (error) {
        healthCheck.lastCheck = Date.now();
        healthCheck.lastError = error;
        healthCheck.lastResult = null;
        
        results[name] = {
          status: 'error',
          error: error.message,
          last_check: new Date(healthCheck.lastCheck).toISOString()
        };

        this.auditLog('health_check_error', {
          check_name: name,
          error: error.message
        }, 'error');
      }
    }

    // Update system health metric
    const overallHealthy = Object.values(results).every(r => r.status === 'healthy');
    this.setMetric('system.health_status', overallHealthy ? 1 : 0);

    return results;
  }

  /**
   * Check if a metric value triggers any alerts
   * @param {string} metricName - Metric name
   * @param {number} value - Metric value
   */
  checkMetricAlerts(metricName, value) {
    const alertConfig = this.config.monitoring?.alerts;
    if (!alertConfig) return;

    // Check specific alert thresholds
    const alertChecks = {
      'search.confidence_rate': {
        threshold: alertConfig.low_confidence_rate_threshold || 0.4,
        condition: 'less_than',
        message: 'Low confidence rate detected'
      },
      'search.external_call_rate': {
        threshold: alertConfig.high_external_call_rate_threshold || 0.3,
        condition: 'greater_than',
        message: 'High external call rate detected'
      },
      'synthesis.conflict_rate': {
        threshold: alertConfig.synthesis_conflict_rate_threshold || 0.1,
        condition: 'greater_than',
        message: 'High synthesis conflict rate detected'
      },
      'errors.api_failure_rate': {
        threshold: alertConfig.api_failure_rate_threshold || 0.05,
        condition: 'greater_than',
        message: 'High API failure rate detected'
      }
    };

    const alertCheck = alertChecks[metricName];
    if (alertCheck) {
      const shouldAlert = this.evaluateAlertCondition(value, alertCheck.threshold, alertCheck.condition);
      
      if (shouldAlert) {
        this.triggerAlert(metricName, {
          metric: metricName,
          value: value,
          threshold: alertCheck.threshold,
          condition: alertCheck.condition,
          message: alertCheck.message
        });
      }
    }
  }

  /**
   * Evaluate alert condition
   * @param {number} value - Current value
   * @param {number} threshold - Threshold value
   * @param {string} condition - Condition type
   * @returns {boolean} Whether alert should trigger
   */
  evaluateAlertCondition(value, threshold, condition) {
    switch (condition) {
      case 'greater_than':
        return value > threshold;
      case 'less_than':
        return value < threshold;
      case 'equals':
        return value === threshold;
      default:
        return false;
    }
  }

  /**
   * Trigger an alert
   * @param {string} alertName - Alert name
   * @param {Object} details - Alert details
   */
  triggerAlert(alertName, details) {
    const now = Date.now();
    const existingAlert = this.alerts.get(alertName);
    
    // Prevent alert spam - only trigger if last alert was more than 5 minutes ago
    if (existingAlert && (now - existingAlert.last_triggered) < 300000) {
      return;
    }

    const alert = {
      name: alertName,
      details: details,
      triggered_at: new Date(now).toISOString(),
      last_triggered: now,
      count: existingAlert ? existingAlert.count + 1 : 1
    };

    this.alerts.set(alertName, alert);

    // Log the alert
    this.auditLog('alert_triggered', alert, 'warn');

    // Emit alert event
    this.emit('alert', alert);

    console.warn(`🚨 ALERT: ${alertName}`, details);
  }

  /**
   * Evaluate all configured alerts
   */
  evaluateAlerts() {
    // Update calculated metrics first
    this.updateCalculatedMetrics();

    // System uptime
    const uptimeSeconds = (Date.now() - this.startTime) / 1000;
    this.setMetric('system.uptime', uptimeSeconds);
  }

  /**
   * Update calculated metrics based on raw metrics
   */
  updateCalculatedMetrics() {
    const totalSearches = this.getMetricValue('search.total_requests') || 0;
    const memoryHits = this.getMetricValue('search.memory_hits') || 0;
    const githubCalls = this.getMetricValue('search.github_calls') || 0;
    const docCalls = this.getMetricValue('search.documentation_calls') || 0;
    const totalConflicts = this.getMetricValue('synthesis.conflicts_detected') || 0;
    const totalErrors = this.getMetricValue('errors.total') || 0;

    // Calculate rates
    if (totalSearches > 0) {
      const confidenceRate = memoryHits / totalSearches;
      this.setMetric('search.confidence_rate', confidenceRate);

      const externalCallRate = (githubCalls + docCalls) / totalSearches;
      this.setMetric('search.external_call_rate', externalCallRate);

      const conflictRate = totalConflicts / totalSearches;
      this.setMetric('synthesis.conflict_rate', conflictRate);

      const errorRate = totalErrors / totalSearches;
      this.setMetric('errors.error_rate', errorRate);
    }
  }

  /**
   * Get comprehensive system status
   * @returns {Object} System status report
   */
  async getSystemStatus() {
    const healthChecks = await this.performHealthChecks();
    
    return {
      timestamp: new Date().toISOString(),
      uptime_seconds: this.getMetricValue('system.uptime'),
      health_checks: healthChecks,
      metrics: this.getMetricsSummary(),
      active_alerts: Array.from(this.alerts.values()),
      recent_audit_events: this.auditEntries.slice(-10),
      configuration: {
        monitoring_enabled: this.config.monitoring?.metrics?.enabled || false,
        audit_enabled: this.config.monitoring?.audit?.enabled || false,
        alert_thresholds: this.config.monitoring?.alerts || {}
      }
    };
  }

  /**
   * Get metrics summary
   * @returns {Object} Metrics summary
   */
  getMetricsSummary() {
    const summary = {};
    
    for (const [name, metric] of this.metrics.entries()) {
      summary[name] = {
        current_value: metric.current_value,
        last_updated: new Date(metric.last_updated).toISOString(),
        labels: metric.labels
      };
    }

    return summary;
  }

  /**
   * Export monitoring data
   * @param {string} format - Export format (json, prometheus, csv)
   * @returns {string} Formatted monitoring data
   */
  exportMonitoringData(format = 'json') {
    const data = {
      metrics: this.getMetricsSummary(),
      alerts: Array.from(this.alerts.values()),
      audit_log: this.auditEntries
    };

    switch (format.toLowerCase()) {
      case 'prometheus':
        return this.exportPrometheusFormat();
      case 'csv':
        return this.exportCSVFormat();
      case 'json':
      default:
        return JSON.stringify(data, null, 2);
    }
  }

  exportPrometheusFormat() {
    let output = '';
    
    for (const [name, metric] of this.metrics.entries()) {
      const metricName = name.replace(/\./g, '_');
      output += `# TYPE ${metricName} gauge\n`;
      output += `${metricName} ${metric.current_value}\n`;
    }

    return output;
  }

  exportCSVFormat() {
    const headers = 'metric_name,current_value,last_updated\n';
    const rows = Array.from(this.metrics.entries()).map(([name, metric]) => 
      `${name},${metric.current_value},${metric.last_updated}`
    ).join('\n');
    
    return headers + rows;
  }

  /**
   * Clear old audit logs and metrics history
   * @param {number} retentionDays - Days to retain data
   */
  cleanup(retentionDays = 30) {
    const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    
    // Clean audit log
    this.auditEntries = this.auditEntries.filter(entry => 
      new Date(entry.timestamp).getTime() > cutoffTime
    );

    // Clean metrics history
    for (const [name, metric] of this.metrics.entries()) {
      metric.history = metric.history.filter(entry => 
        entry.timestamp > cutoffTime
      );
    }

    this.auditLog('monitoring_cleanup', {
      retention_days: retentionDays,
      cutoff_time: new Date(cutoffTime).toISOString()
    });
  }

  getSessionId() {
    if (!this.sessionId) {
      this.sessionId = require('crypto').randomBytes(8).toString('hex');
    }
    return this.sessionId;
  }

  getDefaultConfig() {
    return {
      monitoring: {
        metrics: {
          enabled: true,
          collect_performance: true,
          collect_accuracy: true,
          collect_usage_patterns: true,
          retention_days: 90
        },
        audit: {
          enabled: true,
          log_all_searches: true,
          log_external_calls: true,
          log_synthesis_decisions: true,
          log_confidence_calculations: true,
          audit_file: "./audit.log"
        },
        alerts: {
          low_confidence_rate_threshold: 0.4,
          high_external_call_rate_threshold: 0.3,
          synthesis_conflict_rate_threshold: 0.1,
          api_failure_rate_threshold: 0.05
        }
      }
    };
  }
}

module.exports = MonitoringGovernance;