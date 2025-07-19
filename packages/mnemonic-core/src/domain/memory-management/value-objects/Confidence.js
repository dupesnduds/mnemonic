/**
 * Confidence Value Object - Represents confidence scoring for memory entries
 */

class Confidence {
  constructor(score, factors = {}) {
    this.score = score;
    this.factors = factors;
    this.calculatedAt = new Date();
    
    this.validate();
  }

  static create(score, factors = {}) {
    return new Confidence(score, factors);
  }

  static fromFactors(factors) {
    const score = this.calculateScore(factors);
    return new Confidence(score, factors);
  }

  static calculateScore(factors) {
    const {
      recency = 0,
      relevance = 0,
      popularity = 0,
      completeness = 0,
      accuracy = 0,
      sourceQuality = 0
    } = factors;

    // Weighted scoring algorithm
    const weights = {
      recency: 0.15,
      relevance: 0.30,
      popularity: 0.10,
      completeness: 0.20,
      accuracy: 0.15,
      sourceQuality: 0.10
    };

    const score = Object.entries(weights).reduce((total, [factor, weight]) => {
      const value = factors[factor] || 0;
      return total + (value * weight);
    }, 0);

    return Math.round(score * 100) / 100; // Round to 2 decimal places
  }

  static LOW = 0.3;
  static MEDIUM = 0.6;
  static HIGH = 0.8;

  isLow() {
    return this.score < Confidence.LOW;
  }

  isMedium() {
    return this.score >= Confidence.LOW && this.score < Confidence.HIGH;
  }

  isHigh() {
    return this.score >= Confidence.HIGH;
  }

  isSufficient(threshold = 0.7) {
    return this.score >= threshold;
  }

  equals(other) {
    return other instanceof Confidence && 
           Math.abs(this.score - other.score) < 0.001;
  }

  validate() {
    if (typeof this.score !== 'number') {
      throw new Error('Confidence score must be a number');
    }
    
    if (this.score < 0 || this.score > 1) {
      throw new Error('Confidence score must be between 0 and 1');
    }
    
    if (this.factors && typeof this.factors !== 'object') {
      throw new Error('Confidence factors must be an object');
    }
    
    // Validate individual factors
    Object.entries(this.factors).forEach(([key, value]) => {
      if (typeof value !== 'number' || value < 0 || value > 1) {
        throw new Error(`Confidence factor '${key}' must be a number between 0 and 1`);
      }
    });
  }

  // Business logic methods
  adjustForRecency(daysOld) {
    const maxAge = 365; // 1 year
    const ageFactor = Math.max(0, (maxAge - daysOld) / maxAge);
    
    const adjustedFactors = {
      ...this.factors,
      recency: ageFactor
    };
    
    return Confidence.fromFactors(adjustedFactors);
  }

  adjustForPopularity(useCount, maxUseCount) {
    const popularityFactor = Math.min(1, useCount / maxUseCount);
    
    const adjustedFactors = {
      ...this.factors,
      popularity: popularityFactor
    };
    
    return Confidence.fromFactors(adjustedFactors);
  }

  getLevel() {
    if (this.isHigh()) return 'HIGH';
    if (this.isMedium()) return 'MEDIUM';
    return 'LOW';
  }

  getPercentage() {
    return Math.round(this.score * 100);
  }

  toString() {
    return `${this.getPercentage()}%`;
  }

  toJSON() {
    return {
      score: this.score,
      factors: this.factors,
      level: this.getLevel(),
      percentage: this.getPercentage(),
      calculatedAt: this.calculatedAt
    };
  }
}

module.exports = Confidence;