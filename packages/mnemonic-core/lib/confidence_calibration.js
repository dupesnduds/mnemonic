/**
 * Confidence Calibration System for Brains Memory
 * Tracks prediction accuracy vs. actual success to improve threshold decisions
 */

const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');

class ConfidenceCalibration {
  constructor(configPath = './brains-config.yaml', logPath = './calibration_log.yaml') {
    this.configPath = configPath;
    this.logPath = logPath;
    this.config = this.loadConfig();
    this.calibrationData = this.loadCalibrationLog();
  }

  loadConfig() {
    try {
      return yaml.load(fs.readFileSync(this.configPath, 'utf8'));
    } catch (error) {
      console.warn('Could not load config, using defaults:', error.message);
      return this.getDefaultConfig();
    }
  }

  loadCalibrationLog() {
    try {
      if (fs.existsSync(this.logPath)) {
        return yaml.load(fs.readFileSync(this.logPath, 'utf8')) || { entries: [] };
      }
    } catch (error) {
      console.warn('Could not load calibration log:', error.message);
    }
    
    return {
      metadata: {
        created: new Date().toISOString(),
        version: "1.0",
        total_entries: 0
      },
      entries: []
    };
  }

  saveCalibrationLog() {
    try {
      this.calibrationData.metadata.last_updated = new Date().toISOString();
      this.calibrationData.metadata.total_entries = this.calibrationData.entries.length;
      
      fs.writeFileSync(this.logPath, yaml.dump(this.calibrationData, { indent: 2 }));
    } catch (error) {
      console.error('Failed to save calibration log:', error.message);
    }
  }

  /**
   * Log a prediction and its actual outcome
   * @param {string} problem - The problem that was searched for
   * @param {number} predictedConfidence - The confidence score that was predicted
   * @param {boolean} actualSuccess - Whether the solution actually worked
   * @param {string} source - Which layer provided the solution (memory, github, docs)
   * @param {Object} metadata - Additional context
   */
  logPrediction(problem, predictedConfidence, actualSuccess, source = 'memory', metadata = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      problem_hash: this.hashProblem(problem),
      problem_length: problem.length,
      predicted_confidence: Math.round(predictedConfidence * 100) / 100, // Round to 2 decimals
      actual_success: actualSuccess,
      source: source,
      metadata: {
        category: metadata.category || 'unknown',
        technology: metadata.technology || 'unknown',
        user_feedback: metadata.userFeedback || null,
        time_to_resolution_minutes: metadata.timeToResolution || null,
        solution_used: metadata.solutionUsed || null
      }
    };

    this.calibrationData.entries.push(entry);
    
    // Keep only the most recent entries to prevent unbounded growth
    const maxEntries = this.config?.layered_retrieval?.calibration?.max_entries || 10000;
    if (this.calibrationData.entries.length > maxEntries) {
      this.calibrationData.entries = this.calibrationData.entries.slice(-maxEntries);
    }

    this.saveCalibrationLog();
    
    // Check if recalibration is needed
    this.checkRecalibrationNeeded();
  }

  /**
   * Calculate calibration accuracy across confidence bins
   * @returns {Object} Calibration analysis results
   */
  analyzeCalibration() {
    const entries = this.calibrationData.entries;
    if (entries.length < 10) {
      return { 
        insufficient_data: true, 
        entries_count: entries.length,
        min_required: 10 
      };
    }

    // Create confidence bins (0-10%, 10-20%, etc.)
    const bins = {};
    for (let i = 0; i < 10; i++) {
      bins[i] = { predictions: [], success_rate: 0, avg_confidence: 0, count: 0 };
    }

    // Categorize entries into bins
    entries.forEach(entry => {
      const binIndex = Math.min(Math.floor(entry.predicted_confidence * 10), 9);
      bins[binIndex].predictions.push(entry);
    });

    // Calculate success rates for each bin
    const analysis = {
      timestamp: new Date().toISOString(),
      total_entries: entries.length,
      bins: {},
      overall_accuracy: 0,
      calibration_error: 0,
      confidence_drift: this.calculateConfidenceDrift()
    };

    let totalAccuracy = 0;
    let totalError = 0;
    let validBins = 0;

    for (const [binIndex, bin] of Object.entries(bins)) {
      if (bin.predictions.length > 0) {
        const successCount = bin.predictions.filter(p => p.actual_success).length;
        const successRate = successCount / bin.predictions.length;
        const avgConfidence = bin.predictions.reduce((sum, p) => sum + p.predicted_confidence, 0) / bin.predictions.length;
        
        analysis.bins[binIndex] = {
          confidence_range: `${binIndex * 10}-${(parseInt(binIndex) + 1) * 10}%`,
          count: bin.predictions.length,
          success_rate: Math.round(successRate * 100) / 100,
          avg_predicted_confidence: Math.round(avgConfidence * 100) / 100,
          calibration_error: Math.abs(successRate - avgConfidence)
        };

        totalAccuracy += successRate;
        totalError += Math.abs(successRate - avgConfidence);
        validBins++;
      }
    }

    if (validBins > 0) {
      analysis.overall_accuracy = Math.round((totalAccuracy / validBins) * 100) / 100;
      analysis.calibration_error = Math.round((totalError / validBins) * 100) / 100;
    }

    return analysis;
  }

  /**
   * Calculate confidence drift over time
   * @returns {Object} Drift analysis
   */
  calculateConfidenceDrift() {
    const entries = this.calibrationData.entries;
    if (entries.length < 50) {
      return { insufficient_data: true };
    }

    // Split into recent and historical periods
    const splitPoint = Math.floor(entries.length * 0.7);
    const historical = entries.slice(0, splitPoint);
    const recent = entries.slice(splitPoint);

    const historicalAccuracy = this.calculateAccuracy(historical);
    const recentAccuracy = this.calculateAccuracy(recent);

    const drift = recentAccuracy - historicalAccuracy;
    const driftThreshold = this.config?.layered_retrieval?.calibration?.confidence_drift_threshold || 0.15;

    return {
      historical_accuracy: Math.round(historicalAccuracy * 100) / 100,
      recent_accuracy: Math.round(recentAccuracy * 100) / 100,
      drift: Math.round(drift * 100) / 100,
      significant_drift: Math.abs(drift) > driftThreshold,
      threshold: driftThreshold
    };
  }

  calculateAccuracy(entries) {
    if (entries.length === 0) return 0;
    const successCount = entries.filter(entry => entry.actual_success).length;
    return successCount / entries.length;
  }

  /**
   * Check if recalibration is needed based on configuration
   */
  checkRecalibrationNeeded() {
    const config = this.config?.layered_retrieval?.calibration;
    if (!config?.enabled) return false;

    const minSamples = config.min_samples_for_recalibration || 50;
    const intervalDays = config.recalibration_interval_days || 30;

    if (this.calibrationData.entries.length < minSamples) {
      return false;
    }

    // Check if enough time has passed since last recalibration
    const lastRecalibration = this.calibrationData.metadata.last_recalibration;
    if (lastRecalibration) {
      const daysSince = (Date.now() - new Date(lastRecalibration).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < intervalDays) {
        return false;
      }
    }

    // Check for significant drift
    const drift = this.calculateConfidenceDrift();
    if (drift.significant_drift) {
      console.warn('🚨 Significant confidence drift detected:', drift);
      this.suggestRecalibration();
    }

    return true;
  }

  /**
   * Suggest new confidence thresholds based on calibration data
   * @returns {Object} Suggested threshold adjustments
   */
  suggestRecalibration() {
    const analysis = this.analyzeCalibration();
    
    if (analysis.insufficient_data) {
      return { error: 'Insufficient data for recalibration', ...analysis };
    }

    const currentThresholds = this.config?.layered_retrieval?.confidence_thresholds || {};
    const suggestions = {
      timestamp: new Date().toISOString(),
      current_thresholds: currentThresholds,
      suggested_thresholds: {},
      reasoning: {},
      calibration_analysis: analysis
    };

    // Analyze each bin to suggest threshold adjustments
    for (const [binIndex, bin] of Object.entries(analysis.bins)) {
      if (bin.count > 10) { // Only consider bins with sufficient data
        const actualSuccessRate = bin.success_rate;
        const predictedConfidence = bin.avg_predicted_confidence;
        
        if (Math.abs(actualSuccessRate - predictedConfidence) > 0.15) {
          // Significant miscalibration detected
          suggestions.reasoning[`bin_${binIndex}`] = {
            issue: 'Miscalibrated',
            predicted: predictedConfidence,
            actual: actualSuccessRate,
            difference: Math.round((actualSuccessRate - predictedConfidence) * 100) / 100
          };
        }
      }
    }

    // Suggest specific threshold adjustments
    const memoryThreshold = currentThresholds.memory_sufficient || 0.70;
    const githubThreshold = currentThresholds.github_expansion || 0.30;

    // If high-confidence predictions are failing, lower the memory threshold
    if (analysis.bins['7'] && analysis.bins['7'].success_rate < 0.8) {
      suggestions.suggested_thresholds.memory_sufficient = Math.min(memoryThreshold + 0.05, 0.85);
      suggestions.reasoning.memory_sufficient = 'High confidence predictions showing lower success rate';
    }

    // If low-confidence predictions are succeeding, lower the github threshold
    if (analysis.bins['3'] && analysis.bins['3'].success_rate > 0.6) {
      suggestions.suggested_thresholds.github_expansion = Math.max(githubThreshold - 0.05, 0.20);
      suggestions.reasoning.github_expansion = 'Lower confidence predictions showing good success rate';
    }

    // Log the recalibration suggestion
    console.log('📊 Recalibration analysis complete:', {
      overall_accuracy: analysis.overall_accuracy,
      calibration_error: analysis.calibration_error,
      suggestions_count: Object.keys(suggestions.suggested_thresholds).length
    });

    return suggestions;
  }

  /**
   * Get confidence adjustment factor based on historical data
   * @param {number} rawConfidence - The raw confidence score
   * @param {string} source - The source of the prediction
   * @returns {number} Adjusted confidence score
   */
  getAdjustedConfidence(rawConfidence, source = 'memory') {
    const analysis = this.analyzeCalibration();
    
    if (analysis.insufficient_data) {
      return rawConfidence; // No adjustment if insufficient data
    }

    const binIndex = Math.min(Math.floor(rawConfidence * 10), 9);
    const bin = analysis.bins[binIndex];

    if (!bin || bin.count < 5) {
      return rawConfidence; // No adjustment if insufficient data for this confidence range
    }

    // Adjust based on historical accuracy in this confidence range
    const historicalAccuracy = bin.success_rate;
    const adjustmentFactor = historicalAccuracy / bin.avg_predicted_confidence;

    // Apply conservative adjustment (max 20% change)
    const maxAdjustment = 0.20;
    const boundedAdjustment = Math.max(
      1 - maxAdjustment, 
      Math.min(1 + maxAdjustment, adjustmentFactor)
    );

    const adjustedConfidence = rawConfidence * boundedAdjustment;
    
    // Ensure confidence stays within valid range
    return Math.max(0, Math.min(1, adjustedConfidence));
  }

  /**
   * Generate a hash for the problem to avoid storing sensitive information
   * @param {string} problem - The problem description
   * @returns {string} SHA256 hash of the problem
   */
  hashProblem(problem) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(problem).digest('hex').substring(0, 16);
  }

  getDefaultConfig() {
    return {
      layered_retrieval: {
        confidence_thresholds: {
          memory_sufficient: 0.70,
          github_expansion: 0.30,
          documentation_minimum: 0.10
        },
        calibration: {
          enabled: true,
          min_samples_for_recalibration: 50,
          recalibration_interval_days: 30,
          confidence_drift_threshold: 0.15,
          max_entries: 10000
        }
      }
    };
  }

  /**
   * Export calibration data for analysis
   * @param {string} format - Export format ('json', 'csv', 'yaml')
   * @returns {string} Formatted data
   */
  exportCalibrationData(format = 'json') {
    const analysis = this.analyzeCalibration();
    
    switch (format.toLowerCase()) {
      case 'csv':
        return this.exportAsCSV();
      case 'yaml':
        return yaml.dump({ analysis, raw_data: this.calibrationData });
      case 'json':
      default:
        return JSON.stringify({ analysis, raw_data: this.calibrationData }, null, 2);
    }
  }

  exportAsCSV() {
    const headers = 'timestamp,problem_hash,predicted_confidence,actual_success,source,category\n';
    const rows = this.calibrationData.entries.map(entry => 
      `${entry.timestamp},${entry.problem_hash},${entry.predicted_confidence},${entry.actual_success},${entry.source},${entry.metadata.category}`
    ).join('\n');
    
    return headers + rows;
  }
}

module.exports = ConfidenceCalibration;