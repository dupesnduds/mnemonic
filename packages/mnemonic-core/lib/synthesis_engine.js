/**
 * Synthesis and Conflict Resolution Engine for Brains Memory
 * Combines solutions from multiple sources and resolves conflicts intelligently
 */

const fs = require('fs');
const yaml = require('js-yaml');

class SynthesisEngine {
  constructor(configPath = './brains-config.yaml') {
    this.configPath = configPath;
    this.config = this.loadConfig();
    this.conflictLog = [];
    this.confidenceCalibration = null;
  }

  /**
   * Initialize with confidence calibration system
   * @param {Object} confidenceCalibration - Confidence calibration instance
   */
  initialize(confidenceCalibration) {
    this.confidenceCalibration = confidenceCalibration;
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
   * Synthesize solutions from multiple sources (called by layered retrieval)
   * @param {string} query - The search query
   * @param {Array} sources - Array of source objects with data and weights
   * @returns {Object} Synthesized solution with conflict resolution
   */
  synthesizeSources(query, sources) {
    const solutions = [];
    
    // Convert sources to solutions format
    for (const source of sources) {
      if (source.data && Array.isArray(source.data)) {
        for (const item of source.data) {
          solutions.push({
            source: source.name,
            weight: source.weight,
            confidence: item.trust_score || 0.5,
            content: item.solution || item.title || item.summary || 'No content',
            metadata: item
          });
        }
      }
    }
    
    return this.synthesizeSolutions(solutions, query);
  }

  /**
   * Synthesize solutions from multiple sources
   * @param {Array} solutions - Array of solution objects from different sources
   * @param {string} problemDescription - The original problem description
   * @returns {Object} Synthesized solution with conflict resolution
   */
  synthesizeSolutions(solutions, problemDescription) {
    if (!solutions || solutions.length === 0) {
      return { 
        synthesized_solution: 'No solutions available for synthesis',
        conflicts_detected: [],
        source_breakdown: {},
        quality_score: 0
      };
    }

    if (solutions.length === 1) {
      return {
        synthesized_solution: solutions[0].content || 'No solution content available',
        conflicts_detected: [],
        source_breakdown: {
          [solutions[0].source]: {
            weight: solutions[0].weight || 1.0,
            confidence: solutions[0].confidence || 0.5,
            used: true
          }
        },
        quality_score: solutions[0].confidence || 0.5
      };
    }

    const synthesis = {
      problem: problemDescription,
      timestamp: new Date().toISOString(),
      sources: solutions.map(s => ({ source: s.source, confidence: s.confidence })),
      conflicts_detected: [],
      synthesis_confidence: 0,
      synthesized_solution: '',
      source_weights_applied: {},
      quality_metrics: {}
    };

    // Simplified synthesis for now - just take the highest weighted solution
    const sourceWeights = this.config.synthesis?.source_weights || {
      memory: 0.60,
      documentation: 0.30,
      github: 0.25
    };

    // Score solutions by weight and confidence
    let bestSolution = solutions[0];
    let bestScore = 0;

    for (const solution of solutions) {
      const weight = sourceWeights[solution.source] || 0.1;
      const score = weight * (solution.confidence || 0.5);
      if (score > bestScore) {
        bestScore = score;
        bestSolution = solution;
      }
    }

    synthesis.synthesized_solution = bestSolution.content || 'No solution content available';
    synthesis.synthesis_confidence = bestScore;
    synthesis.source_weights_applied = sourceWeights;
    synthesis.quality_metrics = { combined_score: bestScore };

    return {
      synthesized_solution: synthesis.synthesized_solution,
      conflicts_detected: synthesis.conflicts_detected,
      source_breakdown: {
        [bestSolution.source]: {
          weight: sourceWeights[bestSolution.source] || 0.1,
          confidence: bestSolution.confidence || 0.5,
          used: true
        }
      },
      quality_score: bestScore
    };
  }

  /**
   * Detect conflicts between solutions from different sources
   * @param {Array} solutions - Array of solution objects
   * @returns {Array} Array of detected conflicts
   */
  detectConflicts(solutions) {
    const conflicts = [];
    const conflictConfig = this.config.synthesis?.conflict_detection;
    
    if (!conflictConfig?.enabled) {
      return conflicts;
    }

    // Compare each pair of solutions
    for (let i = 0; i < solutions.length; i++) {
      for (let j = i + 1; j < solutions.length; j++) {
        const solution1 = solutions[i];
        const solution2 = solutions[j];

        const conflict = this.compareSolutions(solution1, solution2, conflictConfig);
        if (conflict) {
          conflicts.push({
            id: `conflict_${i}_${j}`,
            source1: solution1.source,
            source2: solution2.source,
            type: conflict.type,
            severity: conflict.severity,
            description: conflict.description,
            conflicting_statements: conflict.statements
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Compare two solutions for conflicts
   * @param {Object} solution1 - First solution
   * @param {Object} solution2 - Second solution
   * @param {Object} conflictConfig - Conflict detection configuration
   * @returns {Object|null} Conflict details or null if no conflict
   */
  compareSolutions(solution1, solution2, conflictConfig) {
    const content1 = solution1.content?.toLowerCase() || '';
    const content2 = solution2.content?.toLowerCase() || '';

    // Check for direct contradictions using keywords
    const contradictionKeywords = conflictConfig.contradiction_keywords || [];
    const contradictions = this.findContradictions(content1, content2, contradictionKeywords);

    if (contradictions.length > 0) {
      return {
        type: 'contradiction',
        severity: 'high',
        description: 'Solutions contain contradictory advice',
        statements: contradictions
      };
    }

    // Check for semantic similarity with different conclusions
    const similarity = this.calculateTextSimilarity(content1, content2);
    const similarityThreshold = conflictConfig.similarity_threshold || 0.7;

    if (similarity > similarityThreshold) {
      // High similarity but from different sources might indicate different approaches
      const approachConflict = this.detectApproachConflicts(content1, content2);
      if (approachConflict) {
        return {
          type: 'approach_difference',
          severity: 'medium',
          description: 'Similar problems but different recommended approaches',
          statements: approachConflict.differences
        };
      }
    }

    // Check for version or technology conflicts
    const versionConflict = this.detectVersionConflicts(content1, content2);
    if (versionConflict) {
      return {
        type: 'version_conflict',
        severity: 'medium',
        description: 'Solutions recommend different versions or technologies',
        statements: versionConflict.conflicts
      };
    }

    return null;
  }

  /**
   * Find direct contradictions in solution content
   * @param {string} content1 - First solution content
   * @param {string} content2 - Second solution content
   * @param {Array} contradictionKeywords - Keywords that indicate contradictions
   * @returns {Array} Array of contradictory statements
   */
  findContradictions(content1, content2, contradictionKeywords) {
    const contradictions = [];

    // Simple contradiction detection
    for (const keyword of contradictionKeywords) {
      const regex = new RegExp(`\\b${keyword}\\b.*?[.!?]`, 'gi');
      const matches1 = content1.match(regex) || [];
      const matches2 = content2.match(regex) || [];

      if (matches1.length > 0 && matches2.length > 0) {
        contradictions.push({
          keyword: keyword,
          statement1: matches1[0],
          statement2: matches2[0]
        });
      }
    }

    // Check for opposing recommendations
    const oppositePatterns = [
      { positive: /should use|recommended|best practice/gi, negative: /avoid|don't use|deprecated/gi },
      { positive: /enable|turn on/gi, negative: /disable|turn off/gi },
      { positive: /include|add/gi, negative: /remove|exclude/gi }
    ];

    for (const pattern of oppositePatterns) {
      const pos1 = content1.match(pattern.positive);
      const neg1 = content1.match(pattern.negative);
      const pos2 = content2.match(pattern.positive);
      const neg2 = content2.match(pattern.negative);

      if ((pos1 && neg2) || (neg1 && pos2)) {
        contradictions.push({
          type: 'opposite_recommendation',
          content1_stance: pos1 ? 'positive' : 'negative',
          content2_stance: pos2 ? 'positive' : 'negative'
        });
      }
    }

    return contradictions;
  }

  /**
   * Detect conflicts in approaches or methodologies
   * @param {string} content1 - First solution content
   * @param {string} content2 - Second solution content
   * @returns {Object|null} Approach conflict details
   */
  detectApproachConflicts(content1, content2) {
    const approaches = {
      content1: this.extractApproaches(content1),
      content2: this.extractApproaches(content2)
    };

    const differences = [];

    // Compare framework recommendations
    if (approaches.content1.frameworks.length > 0 && approaches.content2.frameworks.length > 0) {
      const frameworkOverlap = approaches.content1.frameworks.filter(f => 
        approaches.content2.frameworks.includes(f)
      );

      if (frameworkOverlap.length === 0) {
        differences.push({
          type: 'framework_difference',
          solution1_frameworks: approaches.content1.frameworks,
          solution2_frameworks: approaches.content2.frameworks
        });
      }
    }

    // Compare architectural patterns
    if (approaches.content1.patterns.length > 0 && approaches.content2.patterns.length > 0) {
      const patternOverlap = approaches.content1.patterns.filter(p => 
        approaches.content2.patterns.includes(p)
      );

      if (patternOverlap.length === 0) {
        differences.push({
          type: 'pattern_difference',
          solution1_patterns: approaches.content1.patterns,
          solution2_patterns: approaches.content2.patterns
        });
      }
    }

    return differences.length > 0 ? { differences } : null;
  }

  /**
   * Extract approaches, frameworks, and patterns from solution content
   * @param {string} content - Solution content
   * @returns {Object} Extracted approaches
   */
  extractApproaches(content) {
    const frameworks = [];
    const patterns = [];

    // Common framework patterns
    const frameworkPatterns = [
      /react/gi, /vue/gi, /angular/gi, /express/gi, /fastify/gi,
      /next\.?js/gi, /nuxt/gi, /gatsby/gi, /svelte/gi
    ];

    // Common architectural patterns
    const patternKeywords = [
      /mvc/gi, /mvvm/gi, /microservices/gi, /monolith/gi,
      /rest/gi, /graphql/gi, /websocket/gi, /server.?side.?rendering/gi
    ];

    for (const pattern of frameworkPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        frameworks.push(...matches.map(m => m.toLowerCase()));
      }
    }

    for (const pattern of patternKeywords) {
      const matches = content.match(pattern);
      if (matches) {
        patterns.push(...matches.map(m => m.toLowerCase()));
      }
    }

    return {
      frameworks: [...new Set(frameworks)], // Remove duplicates
      patterns: [...new Set(patterns)]
    };
  }

  /**
   * Detect version or technology conflicts
   * @param {string} content1 - First solution content
   * @param {string} content2 - Second solution content
   * @returns {Object|null} Version conflict details
   */
  detectVersionConflicts(content1, content2) {
    const versionPattern = /(\w+)\s+(?:version\s+)?(\d+(?:\.\d+)*)/gi;
    
    const versions1 = this.extractVersions(content1, versionPattern);
    const versions2 = this.extractVersions(content2, versionPattern);

    const conflicts = [];

    // Check for same technology with different versions
    for (const [tech1, version1] of Object.entries(versions1)) {
      if (versions2[tech1] && versions2[tech1] !== version1) {
        conflicts.push({
          technology: tech1,
          version1: version1,
          version2: versions2[tech1]
        });
      }
    }

    return conflicts.length > 0 ? { conflicts } : null;
  }

  /**
   * Extract version information from content
   * @param {string} content - Solution content
   * @param {RegExp} pattern - Version extraction pattern
   * @returns {Object} Technology to version mapping
   */
  extractVersions(content, pattern) {
    const versions = {};
    let match;

    while ((match = pattern.exec(content)) !== null) {
      const tech = match[1].toLowerCase();
      const version = match[2];
      versions[tech] = version;
    }

    return versions;
  }

  /**
   * Apply source weights to solutions based on configuration
   * @param {Array} solutions - Array of solution objects
   * @returns {Object} Weighted solutions and applied weights
   */
  applySourceWeights(solutions) {
    const sourceWeights = this.config.synthesis?.source_weights || {
      memory: 0.60,
      documentation: 0.30,
      github_trusted: 0.25,
      github_community: 0.10
    };

    const weightedSolutions = solutions.map(solution => {
      let weight = sourceWeights[solution.source] || 0.1;
      
      // Apply trust score if available (for GitHub sources)
      if (solution.trust_score) {
        weight *= solution.trust_score;
      }

      return {
        ...solution,
        applied_weight: weight,
        weighted_confidence: (solution.confidence || 0.5) * weight
      };
    });

    return {
      solutions: weightedSolutions,
      weights: sourceWeights
    };
  }

  /**
   * Resolve conflicts and create synthesized solution
   * @param {Array} weightedSolutions - Solutions with applied weights
   * @param {Array} conflicts - Detected conflicts
   * @returns {Object} Resolved solution
   */
  resolveConflicts(weightedSolutions, conflicts) {
    // Sort solutions by weighted confidence
    const sortedSolutions = weightedSolutions.sort((a, b) => 
      b.weighted_confidence - a.weighted_confidence
    );

    const primarySolution = sortedSolutions[0];
    const secondarySolutions = sortedSolutions.slice(1);

    let synthesizedContent = primarySolution.content;
    let synthesisConfidence = primarySolution.weighted_confidence;

    // If there are conflicts, create a more nuanced synthesis
    if (conflicts.length > 0) {
      synthesizedContent = this.createConflictAwareSynthesis(
        primarySolution, 
        secondarySolutions, 
        conflicts
      );
      
      // Reduce confidence when conflicts are present
      synthesisConfidence *= Math.max(0.7, 1 - (conflicts.length * 0.1));
    } else if (secondarySolutions.length > 0) {
      // No conflicts, enhance primary solution with secondary insights
      synthesizedContent = this.enhanceSolutionWithSecondaryInsights(
        primarySolution,
        secondarySolutions
      );
      
      // Slightly increase confidence when multiple sources agree
      synthesisConfidence = Math.min(1.0, synthesisConfidence * 1.1);
    }

    return {
      content: synthesizedContent,
      confidence: Math.round(synthesisConfidence * 100) / 100,
      primary_source: primarySolution.source,
      contributing_sources: secondarySolutions.map(s => s.source),
      conflict_resolution_applied: conflicts.length > 0
    };
  }

  /**
   * Create synthesis that acknowledges and addresses conflicts
   * @param {Object} primarySolution - Highest weighted solution
   * @param {Array} secondarySolutions - Other solutions
   * @param {Array} conflicts - Detected conflicts
   * @returns {string} Conflict-aware synthesized content
   */
  createConflictAwareSynthesis(primarySolution, secondarySolutions, conflicts) {
    let synthesis = `**Primary Approach (${primarySolution.source}):**\n${primarySolution.content}\n\n`;

    // Add alternative approaches
    if (secondarySolutions.length > 0) {
      synthesis += "**Alternative Approaches:**\n";
      secondarySolutions.forEach((solution, index) => {
        synthesis += `${index + 1}. **From ${solution.source}:** ${solution.content}\n\n`;
      });
    }

    // Address conflicts explicitly
    if (conflicts.length > 0) {
      synthesis += "**⚠️ Conflicting Information Detected:**\n";
      conflicts.forEach((conflict, index) => {
        synthesis += `${index + 1}. **${conflict.type}** between ${conflict.source1} and ${conflict.source2}: ${conflict.description}\n`;
      });

      synthesis += "\n**Recommended Resolution:**\n";
      synthesis += `Follow the primary approach (${primarySolution.source}) as it has the highest trust score, but be aware of the alternative methods mentioned above. `;
      synthesis += "Consider testing both approaches in a development environment to determine which works best for your specific use case.\n";
    }

    return synthesis;
  }

  /**
   * Enhance primary solution with insights from secondary sources
   * @param {Object} primarySolution - Primary solution
   * @param {Array} secondarySolutions - Secondary solutions
   * @returns {string} Enhanced solution content
   */
  enhanceSolutionWithSecondaryInsights(primarySolution, secondarySolutions) {
    let enhanced = primarySolution.content;

    // Extract additional insights from secondary solutions
    const additionalInsights = [];
    
    secondarySolutions.forEach(solution => {
      // Look for unique points not covered in primary solution
      const uniquePoints = this.extractUniqueInsights(primarySolution.content, solution.content);
      if (uniquePoints.length > 0) {
        additionalInsights.push({
          source: solution.source,
          insights: uniquePoints
        });
      }
    });

    // Add additional insights if found
    if (additionalInsights.length > 0) {
      enhanced += "\n\n**Additional Insights:**\n";
      additionalInsights.forEach(insight => {
        enhanced += `- **From ${insight.source}:** ${insight.insights.join('; ')}\n`;
      });
    }

    return enhanced;
  }

  /**
   * Extract unique insights from secondary solution not present in primary
   * @param {string} primaryContent - Primary solution content
   * @param {string} secondaryContent - Secondary solution content
   * @returns {Array} Array of unique insights
   */
  extractUniqueInsights(primaryContent, secondaryContent) {
    const uniqueInsights = [];
    
    // Simple keyword-based extraction (could be enhanced with NLP)
    const keyPhrases = [
      /best practice[s]?:?(.+?)(?:[.!?]|$)/gi,
      /tip:?(.+?)(?:[.!?]|$)/gi,
      /note:?(.+?)(?:[.!?]|$)/gi,
      /warning:?(.+?)(?:[.!?]|$)/gi,
      /important:?(.+?)(?:[.!?]|$)/gi
    ];

    for (const phrase of keyPhrases) {
      let match;
      while ((match = phrase.exec(secondaryContent)) !== null) {
        const insight = match[1].trim();
        // Check if this insight is not already in primary content
        if (!primaryContent.toLowerCase().includes(insight.toLowerCase())) {
          uniqueInsights.push(insight);
        }
      }
    }

    return uniqueInsights;
  }

  /**
   * Calculate quality metrics for the synthesis
   * @param {Array} originalSolutions - Original solutions
   * @param {Object} resolvedSolution - Resolved/synthesized solution
   * @returns {Object} Quality metrics
   */
  calculateQualityMetrics(originalSolutions, resolvedSolution) {
    const qualityFactors = this.config.synthesis?.quality_factors || {};
    
    return {
      completeness_score: this.calculateCompleteness(resolvedSolution.content),
      recency_score: this.calculateRecency(originalSolutions),
      specificity_score: this.calculateSpecificity(resolvedSolution.content),
      source_authority_score: this.calculateSourceAuthority(originalSolutions),
      overall_quality_score: 0 // Will be calculated based on weighted factors
    };
  }

  calculateCompleteness(content) {
    // Simple heuristic based on content length and structure
    const length = content.length;
    const hasCodeExamples = /```|`.*`/.test(content);
    const hasSteps = /\d+\.|step|first|then|finally/i.test(content);
    
    let score = Math.min(1.0, length / 1000); // Base score on length
    if (hasCodeExamples) score += 0.2;
    if (hasSteps) score += 0.1;
    
    return Math.min(1.0, score);
  }

  calculateRecency(solutions) {
    const now = Date.now();
    const recentScores = solutions.map(solution => {
      if (!solution.timestamp) return 0.5; // Default if no timestamp
      
      const age = now - new Date(solution.timestamp).getTime();
      const daysSinceUpdate = age / (1000 * 60 * 60 * 24);
      
      // Decay score over time
      return Math.max(0.1, 1 - (daysSinceUpdate / 365));
    });
    
    return recentScores.reduce((sum, score) => sum + score, 0) / recentScores.length;
  }

  calculateSpecificity(content) {
    // Look for specific technical terms, code examples, exact steps
    const specificityIndicators = [
      /\b\d+\.\d+\b/, // Version numbers
      /```[\s\S]*?```/, // Code blocks
      /`[^`]+`/, // Inline code
      /https?:\/\//, // URLs
      /\b[A-Z_]{2,}\b/, // Constants/env vars
      /-{1,2}[a-z-]+/, // CLI flags
    ];
    
    let specificityScore = 0;
    specificityIndicators.forEach(indicator => {
      const matches = content.match(indicator);
      if (matches) {
        specificityScore += Math.min(0.2, matches.length * 0.05);
      }
    });
    
    return Math.min(1.0, specificityScore);
  }

  calculateSourceAuthority(solutions) {
    const authorityScores = solutions.map(solution => {
      switch (solution.source) {
        case 'memory': return 0.9; // High trust in institutional memory
        case 'documentation': return 0.8; // High trust in official docs
        case 'github_trusted': return 0.7; // Good trust in verified repos
        case 'github_community': return 0.4; // Lower trust in community
        default: return 0.3;
      }
    });
    
    return authorityScores.reduce((sum, score) => sum + score, 0) / authorityScores.length;
  }

  /**
   * Calculate text similarity using simple word overlap
   * @param {string} text1 - First text
   * @param {string} text2 - Second text
   * @returns {number} Similarity score between 0 and 1
   */
  calculateTextSimilarity(text1, text2) {
    const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Log conflict for analysis and improvement
   * @param {string} problem - Problem description
   * @param {Array} conflicts - Detected conflicts
   * @param {Object} resolution - How the conflict was resolved
   */
  logConflict(problem, conflicts, resolution) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      problem_hash: this.hashString(problem),
      conflicts: conflicts,
      resolution_method: resolution.conflict_resolution_applied ? 'explicit_synthesis' : 'weighted_selection',
      final_confidence: resolution.confidence
    };

    this.conflictLog.push(logEntry);

    // Keep only recent conflicts to prevent memory bloat
    if (this.conflictLog.length > 1000) {
      this.conflictLog = this.conflictLog.slice(-1000);
    }
  }

  formatSingleSolution(solution) {
    return {
      problem: solution.problem || 'Unknown',
      timestamp: new Date().toISOString(),
      sources: [{ source: solution.source, confidence: solution.confidence }],
      conflicts_detected: [],
      synthesis_confidence: solution.confidence || 0.5,
      synthesized_solution: solution.content,
      source_weights_applied: { [solution.source]: 1.0 },
      quality_metrics: this.calculateQualityMetrics([solution], { content: solution.content })
    };
  }

  hashString(str) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(str).digest('hex').substring(0, 16);
  }

  getDefaultConfig() {
    return {
      synthesis: {
        enabled: true,
        source_weights: {
          memory: 0.60,
          documentation: 0.30,
          github_trusted: 0.25,
          github_community: 0.10
        },
        conflict_detection: {
          enabled: true,
          similarity_threshold: 0.7,
          contradiction_keywords: ["don't", "avoid", "never", "instead", "deprecated", "obsolete"]
        },
        quality_factors: {
          completeness_weight: 0.3,
          recency_weight: 0.2,
          specificity_weight: 0.25,
          source_authority_weight: 0.25
        }
      }
    };
  }
}

module.exports = SynthesisEngine;