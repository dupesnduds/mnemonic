const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

/**
 * Learning Engine - Automatically captures solutions when errors are resolved
 * Implements the "minimal viable attempt logic" and progressive problem-solving
 */
class LearningEngine {
  constructor(memoryWrapper) {
    this.memory = memoryWrapper;
    this.learningSession = new Map(); // Track current learning session
    this.progressiveAttempts = new Map(); // Track progressive complexity
    this.successPatterns = new Map(); // Track what works
  }

  /**
   * Start a learning session for a specific problem
   * @param {string} problemId - Unique identifier for the problem
   * @param {Object} problemContext - Context about the problem
   */
  startLearningSession(problemId, problemContext) {
    this.learningSession.set(problemId, {
      startTime: Date.now(),
      problem: problemContext.problem,
      category: problemContext.category,
      attempts: [],
      context: problemContext.context,
      technologyStack: problemContext.technologyStack || [],
      errorPatterns: problemContext.errorPatterns || []
    });

    console.log(`🎓 Learning session started for: ${problemContext.problem}`);
  }

  /**
   * Suggest minimal viable attempts before trying complex solutions
   * @param {string} problemId - Problem identifier
   * @param {Object} errorAnalysis - Analysis of the current error
   * @returns {Array} Array of progressive attempts from simple to complex
   */
  getProgressiveAttempts(problemId, errorAnalysis) {
    const session = this.learningSession.get(problemId);
    if (!session) {
      return this.getDefaultProgressiveAttempts(errorAnalysis);
    }

    const attempts = [];
    
    // Level 1: Minimal/Basic attempts (try these first)
    attempts.push(...this.getMinimalAttempts(errorAnalysis));
    
    // Level 2: Standard solutions
    attempts.push(...this.getStandardAttempts(errorAnalysis));
    
    // Level 3: Advanced solutions (only if basic ones fail)
    attempts.push(...this.getAdvancedAttempts(errorAnalysis));

    return attempts;
  }

  getMinimalAttempts(errorAnalysis) {
    const minimal = [];
    
    switch (errorAnalysis.category) {
      case 'build':
        minimal.push({
          level: 'minimal',
          description: 'Clear package manager cache',
          commands: ['npm cache clean --force'],
          reasoning: 'Cached data often causes build issues'
        });
        minimal.push({
          level: 'minimal', 
          description: 'Reinstall dependencies',
          commands: ['rm -rf node_modules', 'npm install'],
          reasoning: 'Dependency corruption is common'
        });
        break;
        
      case 'networking':
        minimal.push({
          level: 'minimal',
          description: 'Check basic connectivity',
          commands: ['ping google.com -c 1'],
          reasoning: 'Verify internet connection first'
        });
        minimal.push({
          level: 'minimal',
          description: 'Retry with timeout',
          commands: ['# Add --timeout=60000 to your command'],
          reasoning: 'Network operations may need more time'
        });
        break;
        
      case 'authentication':
        minimal.push({
          level: 'minimal',
          description: 'Check environment variables',
          commands: ['echo $API_KEY', 'env | grep -i auth'],
          reasoning: 'Missing credentials are most common cause'
        });
        break;
        
      default:
        minimal.push({
          level: 'minimal',
          description: 'Restart the process',
          commands: ['# Stop and restart your application'],
          reasoning: 'Many issues resolve with a fresh start'
        });
    }
    
    return minimal;
  }

  getStandardAttempts(errorAnalysis) {
    const standard = [];
    
    switch (errorAnalysis.category) {
      case 'build':
        standard.push({
          level: 'standard',
          description: 'Update build tools',
          commands: ['npm update', 'npm audit fix'],
          reasoning: 'Outdated dependencies cause compatibility issues'
        });
        break;
        
      case 'networking':
        standard.push({
          level: 'standard',
          description: 'Configure proxy/DNS',
          commands: ['npm config set registry https://registry.npmjs.org/'],
          reasoning: 'Registry configuration issues'
        });
        break;
    }
    
    return standard;
  }

  getAdvancedAttempts(errorAnalysis) {
    const advanced = [];
    
    switch (errorAnalysis.category) {
      case 'build':
        advanced.push({
          level: 'advanced',
          description: 'Rebuild native modules',
          commands: ['npm rebuild', 'node-gyp rebuild'],
          reasoning: 'Native module compilation issues'
        });
        break;
    }
    
    return advanced;
  }

  getDefaultProgressiveAttempts(errorAnalysis) {
    // Default attempts when no session context
    return [
      {
        level: 'minimal',
        description: 'Basic restart/retry',
        commands: ['# Restart and try again'],
        reasoning: 'Simplest solution first'
      },
      {
        level: 'standard', 
        description: 'Check documentation',
        commands: ['# Consult official documentation'],
        reasoning: 'Official guidance for common issues'
      }
    ];
  }

  /**
   * Record an attempt and its outcome
   * @param {string} problemId - Problem identifier
   * @param {Object} attempt - The attempted solution
   * @param {boolean} successful - Whether the attempt worked
   * @param {string} outcome - Description of what happened
   */
  recordAttempt(problemId, attempt, successful, outcome) {
    const session = this.learningSession.get(problemId);
    if (!session) return;

    const attemptRecord = {
      timestamp: Date.now(),
      attempt: attempt,
      successful: successful,
      outcome: outcome,
      duration: Date.now() - session.startTime
    };

    session.attempts.push(attemptRecord);

    if (successful) {
      console.log(`✅ Successful attempt recorded: ${attempt.description}`);
      this.recordSuccessPattern(session, attemptRecord);
    } else {
      console.log(`❌ Failed attempt recorded: ${attempt.description}`);
    }
  }

  recordSuccessPattern(session, successfulAttempt) {
    const pattern = {
      category: session.category,
      technologyStack: session.technologyStack,
      errorPatterns: session.errorPatterns,
      solution: successfulAttempt.attempt,
      context: session.context,
      duration: successfulAttempt.duration
    };

    // Store in success patterns for future reference
    const patternKey = `${session.category}-${session.technologyStack.join('-')}`;
    this.successPatterns.set(patternKey, pattern);
  }

  /**
   * Automatically store successful resolution in memory
   * @param {string} problemId - Problem identifier
   * @param {string} finalSolution - The solution that worked
   * @returns {boolean} Success status
   */
  async captureSuccessfulResolution(problemId, finalSolution) {
    const session = this.learningSession.get(problemId);
    if (!session) {
      console.warn('⚠️  No learning session found for:', problemId);
      return false;
    }

    try {
      // Create a concise problem description
      const problemDescription = this.createProblemDescription(session);
      
      // Store the solution in memory
      const success = this.memory.storeSolution(
        problemDescription,
        session.category,
        finalSolution,
        false // Store as project-specific initially
      );

      if (success) {
        console.log('🎓 Learning captured: Solution stored in memory');
        
        // Generate learning summary
        this.generateLearningSummary(session, finalSolution);
        
        // Clean up session
        this.learningSession.delete(problemId);
        
        return true;
      } else {
        console.log('⚠️  Failed to store learning in memory');
        return false;
      }
    } catch (error) {
      console.error('❌ Error capturing learning:', error.message);
      return false;
    }
  }

  createProblemDescription(session) {
    // Create a searchable, concise problem description
    const keyTerms = session.errorPatterns
      .slice(0, 3)
      .map(pattern => pattern.replace(/[.*+?^${}()|[\]\\]/g, ''))
      .join(' ');
      
    const techStack = session.technologyStack.slice(0, 2).join(' ');
    
    return `${keyTerms} ${techStack} ${session.category}`.trim();
  }

  generateLearningSummary(session, solution) {
    const duration = Date.now() - session.startTime;
    const attempts = session.attempts.length;
    const successfulAttempts = session.attempts.filter(a => a.successful).length;
    
    console.log('\n📊 Learning Session Summary:');
    console.log(`   Problem: ${session.problem}`);
    console.log(`   Duration: ${Math.round(duration / 1000)}s`);
    console.log(`   Attempts: ${attempts} (${successfulAttempts} successful)`);
    console.log(`   Final Solution: ${solution}`);
    console.log(`   Stored in category: ${session.category}`);
  }

  /**
   * Get recommendations based on previous learning patterns
   * @param {Object} currentProblem - Current problem context
   * @returns {Array} Recommended approaches based on past successes
   */
  getRecommendationsFromLearning(currentProblem) {
    const recommendations = [];
    
    // Look for similar patterns in past successes
    for (const [patternKey, pattern] of this.successPatterns) {
      if (this.isPatternSimilar(currentProblem, pattern)) {
        recommendations.push({
          confidence: this.calculatePatternConfidence(currentProblem, pattern),
          solution: pattern.solution,
          reasoning: `Worked for similar ${pattern.category} issue`,
          pastDuration: pattern.duration
        });
      }
    }
    
    // Sort by confidence
    recommendations.sort((a, b) => b.confidence - a.confidence);
    
    return recommendations.slice(0, 3); // Top 3 recommendations
  }

  isPatternSimilar(currentProblem, pastPattern) {
    // Check category match
    if (currentProblem.category === pastPattern.category) {
      return true;
    }
    
    // Check technology stack overlap
    const techOverlap = currentProblem.technologyStack.filter(tech => 
      pastPattern.technologyStack.includes(tech)
    ).length;
    
    return techOverlap > 0;
  }

  calculatePatternConfidence(currentProblem, pastPattern) {
    let confidence = 0;
    
    // Category match
    if (currentProblem.category === pastPattern.category) {
      confidence += 0.5;
    }
    
    // Technology stack match
    const techOverlap = currentProblem.technologyStack.filter(tech => 
      pastPattern.technologyStack.includes(tech)
    ).length;
    confidence += (techOverlap / Math.max(currentProblem.technologyStack.length, 1)) * 0.3;
    
    // Context similarity (simple keyword matching)
    const contextWords = currentProblem.context.toLowerCase().split(' ');
    const pastContextWords = pastPattern.context.toLowerCase().split(' ');
    const contextOverlap = contextWords.filter(word => 
      pastContextWords.includes(word)
    ).length;
    confidence += (contextOverlap / Math.max(contextWords.length, 1)) * 0.2;
    
    return Math.min(confidence, 1.0);
  }

  /**
   * Prevent chaotic attempts by enforcing progressive complexity
   * @param {string} problemId - Problem identifier
   * @param {Object} proposedAttempt - The attempt being considered
   * @returns {Object} Validation result with recommendations
   */
  validateAttemptProgression(problemId, proposedAttempt) {
    const session = this.learningSession.get(problemId);
    if (!session) {
      return { valid: true, reasoning: 'No session context' };
    }

    const attemptedLevels = new Set(session.attempts.map(a => a.attempt.level));
    
    // Enforce progression: minimal -> standard -> advanced
    if (proposedAttempt.level === 'advanced' && !attemptedLevels.has('minimal')) {
      return {
        valid: false,
        reasoning: 'Try minimal solutions first before advanced approaches',
        recommendation: 'Start with basic troubleshooting steps'
      };
    }
    
    if (proposedAttempt.level === 'standard' && !attemptedLevels.has('minimal')) {
      return {
        valid: false,
        reasoning: 'Try minimal solutions first',
        recommendation: 'Start with simple fixes like cache clearing or restarts'
      };
    }
    
    // Check if this exact attempt was already tried
    const alreadyTried = session.attempts.some(a => 
      a.attempt.description === proposedAttempt.description
    );
    
    if (alreadyTried) {
      return {
        valid: false,
        reasoning: 'This approach was already attempted',
        recommendation: 'Try a different approach or move to next complexity level'
      };
    }
    
    return { valid: true, reasoning: 'Follows logical progression' };
  }

  /**
   * Get current learning statistics
   * @returns {Object} Statistics about learning sessions and patterns
   */
  getLearningStatistics() {
    return {
      activeSessions: this.learningSession.size,
      successPatterns: this.successPatterns.size,
      averageResolutionTime: this.calculateAverageResolutionTime(),
      mostSuccessfulCategories: this.getMostSuccessfulCategories()
    };
  }

  calculateAverageResolutionTime() {
    if (this.successPatterns.size === 0) return 0;
    
    const totalTime = Array.from(this.successPatterns.values())
      .reduce((sum, pattern) => sum + pattern.duration, 0);
      
    return Math.round(totalTime / this.successPatterns.size / 1000); // Convert to seconds
  }

  getMostSuccessfulCategories() {
    const categoryCount = new Map();
    
    for (const pattern of this.successPatterns.values()) {
      categoryCount.set(pattern.category, (categoryCount.get(pattern.category) || 0) + 1);
    }
    
    return Array.from(categoryCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category, count]) => ({ category, count }));
  }
}

module.exports = LearningEngine;