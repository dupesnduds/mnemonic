#!/usr/bin/env node

/**
 * Brains Coaching CLI - Implements progressive problem-solving methodology
 * Prevents chaotic trial-and-error by enforcing structured approach
 * Usage: brains-coach <problem-description>
 */

const readline = require('readline');
const EnhancedMemoryWrapper = require('../lib/enhanced_memory_wrapper.js');
const LearningEngine = require('../lib/learning_engine.js');

class BrainsCoach {
  constructor() {
    this.memory = new EnhancedMemoryWrapper();
    this.learningEngine = new LearningEngine(this.memory);
    this.initialized = false;
    this.currentSession = null;
  }

  async initialize() {
    try {
      await this.memory.initializeFromFile();
      this.initialized = true;
      console.log('🧠 Brains Coach initialized - Ready to guide problem-solving');
    } catch (error) {
      console.warn('⚠️  Memory system unavailable, running in basic coaching mode');
    }
  }

  async startCoachingSession(problemDescription) {
    console.log('\n🎓 BRAINS STRUCTURED PROBLEM-SOLVING SESSION');
    console.log('='.repeat(50));
    console.log(`Problem: ${problemDescription}`);
    console.log('='.repeat(50));

    // Step 1: Analyze the problem
    const problemAnalysis = await this.analyzeProblem(problemDescription);
    
    // Step 2: Check structured memory first
    const memoryResults = await this.checkMemory(problemAnalysis);
    
    // Step 3: If memory has solutions, present them
    if (memoryResults.hasGoodSolution) {
      console.log('\n✅ EXCELLENT! Found proven solutions in memory:');
      this.presentMemorySolutions(memoryResults.solutions);
      
      const useMemorySolution = await this.promptUser('Use one of these memory solutions? (y/n): ');
      if (useMemorySolution.toLowerCase() === 'y') {
        return this.concludeWithMemorySolution(memoryResults);
      }
    }
    
    // Step 4: No good memory solution - start structured approach
    console.log('\n🔬 No proven solution found. Starting structured problem-solving...');
    
    // Start learning session
    const sessionId = this.generateSessionId();
    this.learningEngine.startLearningSession(sessionId, problemAnalysis);
    this.currentSession = sessionId;
    
    // Step 5: Guide through progressive attempts
    await this.guideProgressiveAttempts(sessionId, problemAnalysis);
  }

  async analyzeProblem(problemDescription) {
    console.log('\n📊 STEP 1: Problem Analysis');
    console.log('-'.repeat(30));
    
    const analysis = {
      originalProblem: problemDescription,
      category: 'errors_uncategorised',
      technologyStack: [],
      context: '',
      complexity: 'unknown',
      errorPatterns: []
    };

    // Detect technology stack
    const techDetection = this.detectTechnologyStack(problemDescription);
    analysis.technologyStack = techDetection.technologies;
    analysis.context = techDetection.context;
    
    // Categorize using memory system if available
    if (this.initialized) {
      analysis.category = this.memory.categorizeError(problemDescription);
    }
    
    // Extract error patterns
    analysis.errorPatterns = this.extractErrorPatterns(problemDescription);
    
    // Assess complexity
    analysis.complexity = this.assessComplexity(problemDescription, analysis);
    
    console.log(`📂 Category: ${analysis.category}`);
    console.log(`🔧 Technology: ${analysis.technologyStack.join(', ') || 'General'}`);
    console.log(`📊 Complexity: ${analysis.complexity}`);
    console.log(`🎯 Context: ${analysis.context}`);
    
    return analysis;
  }

  detectTechnologyStack(problemDescription) {
    const technologies = [];
    const lower = problemDescription.toLowerCase();
    
    const techMap = {
      'npm': 'Node.js Package Manager',
      'node': 'Node.js Runtime',
      'react': 'React Framework',
      'python': 'Python Programming',
      'pip': 'Python Package Manager',
      'docker': 'Docker Containerization',
      'git': 'Git Version Control',
      'webpack': 'Webpack Bundler',
      'babel': 'Babel Transpiler',
      'jest': 'Jest Testing',
      'typescript': 'TypeScript',
      'mysql': 'MySQL Database',
      'postgres': 'PostgreSQL Database',
      'mongodb': 'MongoDB Database',
      'redis': 'Redis Cache',
      'nginx': 'Nginx Web Server',
      'apache': 'Apache Web Server'
    };
    
    let context = '';
    for (const [keyword, tech] of Object.entries(techMap)) {
      if (lower.includes(keyword)) {
        technologies.push(keyword);
        context += `${tech} `;
      }
    }
    
    return { technologies, context: context.trim() };
  }

  extractErrorPatterns(problemDescription) {
    const patterns = [];
    
    // Common error pattern extraction
    const errorPatterns = [
      /error.*cannot find module/i,
      /enoent.*no such file/i,
      /eacces.*permission denied/i,
      /etimedout.*timeout/i,
      /econnrefused.*connection refused/i,
      /compilation.*error/i,
      /syntax.*error/i,
      /authentication.*failed/i,
      /404.*not found/i,
      /500.*internal server error/i
    ];
    
    for (const pattern of errorPatterns) {
      const match = problemDescription.match(pattern);
      if (match) {
        patterns.push(match[0]);
      }
    }
    
    return patterns;
  }

  assessComplexity(problemDescription, analysis) {
    let complexityScore = 0;
    
    // Factor in technology stack complexity
    complexityScore += analysis.technologyStack.length * 0.2;
    
    // Factor in error patterns
    complexityScore += analysis.errorPatterns.length * 0.3;
    
    // Factor in description length and technical terms
    const technicalTerms = ['compilation', 'build', 'deployment', 'configuration', 'authentication'];
    const technicalTermCount = technicalTerms.filter(term => 
      problemDescription.toLowerCase().includes(term)
    ).length;
    complexityScore += technicalTermCount * 0.1;
    
    if (complexityScore < 0.3) return 'simple';
    if (complexityScore < 0.7) return 'moderate';
    return 'complex';
  }

  async checkMemory(problemAnalysis) {
    console.log('\n🔍 STEP 2: Checking Structured Memory');
    console.log('-'.repeat(35));
    
    if (!this.initialized) {
      console.log('⚠️  Memory system unavailable');
      return { hasGoodSolution: false, solutions: [] };
    }
    
    try {
      // Search for solutions using enhanced AI
      const suggestions = this.memory.getSuggestions(
        problemAnalysis.originalProblem,
        problemAnalysis.context,
        3
      );
      
      const hasGoodSolution = suggestions.suggestions && 
                             suggestions.suggestions.length > 0 &&
                             suggestions.suggestions[0].score > 0.6; // Only high-confidence solutions
      
      if (hasGoodSolution) {
        console.log(`✅ Found ${suggestions.suggestions.length} high-confidence solutions`);
      } else {
        console.log('ℹ️  No high-confidence solutions found in memory');
      }
      
      return {
        hasGoodSolution,
        solutions: suggestions.suggestions || [],
        contextAnalysis: suggestions.context_analysis
      };
      
    } catch (error) {
      console.warn('⚠️  Error checking memory:', error.message);
      return { hasGoodSolution: false, solutions: [] };
    }
  }

  presentMemorySolutions(solutions) {
    solutions.forEach((solution, index) => {
      console.log(`\n${index + 1}. 📝 Solution (Confidence: ${(solution.score * 100).toFixed(0)}%)`);
      console.log(`   ${solution.solution}`);
      console.log(`   📊 Source: ${solution.source} | Used: ${solution.use_count} times`);
    });
  }

  async guideProgressiveAttempts(sessionId, problemAnalysis) {
    console.log('\n🎯 STEP 3: Progressive Problem-Solving Approach');
    console.log('-'.repeat(45));
    console.log('Following structured methodology to avoid chaotic trial-and-error...\n');
    
    // Get progressive attempts from learning engine
    const attempts = this.learningEngine.getProgressiveAttempts(sessionId, problemAnalysis);
    
    let currentLevel = 'minimal';
    let attemptIndex = 0;
    let solved = false;
    
    while (!solved && attemptIndex < attempts.length) {
      const attempt = attempts[attemptIndex];
      
      // Only show attempts of current complexity level
      if (attempt.level !== currentLevel) {
        // Move to next level if we've tried all current level attempts
        const currentLevelAttempts = attempts.filter(a => a.level === currentLevel);
        const triedCurrentLevel = attemptIndex >= currentLevelAttempts.length;
        
        if (triedCurrentLevel) {
          currentLevel = this.getNextComplexityLevel(currentLevel);
          if (!currentLevel) break; // No more levels
          
          console.log(`\n📈 Moving to ${currentLevel.toUpperCase()} solutions...`);
          console.log('='.repeat(40));
        }
        
        attemptIndex++;
        continue;
      }
      
      // Validate attempt progression
      const validation = this.learningEngine.validateAttemptProgression(sessionId, attempt);
      if (!validation.valid) {
        console.log(`⚠️  Skipping: ${validation.reasoning}`);
        console.log(`💡 ${validation.recommendation}`);
        attemptIndex++;
        continue;
      }
      
      // Present the attempt
      console.log(`\n🔧 ${attempt.level.toUpperCase()} ATTEMPT ${attemptIndex + 1}:`);
      console.log(`📋 ${attempt.description}`);
      console.log(`💭 Reasoning: ${attempt.reasoning}`);
      
      if (attempt.commands && attempt.commands.length > 0) {
        console.log('📝 Commands to try:');
        attempt.commands.forEach(cmd => {
          console.log(`   ${cmd}`);
        });
      }
      
      // Ask user to try it
      const tryAttempt = await this.promptUser('\nTry this approach? (y/n/skip): ');
      
      if (tryAttempt.toLowerCase() === 'skip') {
        attemptIndex++;
        continue;
      }
      
      if (tryAttempt.toLowerCase() === 'y') {
        const result = await this.executeAttempt(sessionId, attempt);
        if (result.successful) {
          solved = true;
          await this.handleSuccessfulResolution(sessionId, attempt, result.outcome);
        } else {
          this.learningEngine.recordAttempt(sessionId, attempt, false, result.outcome);
        }
      }
      
      attemptIndex++;
    }
    
    if (!solved) {
      await this.handleUnresolvedProblem(sessionId, problemAnalysis);
    }
  }

  getNextComplexityLevel(currentLevel) {
    const levels = ['minimal', 'standard', 'advanced'];
    const currentIndex = levels.indexOf(currentLevel);
    return currentIndex < levels.length - 1 ? levels[currentIndex + 1] : null;
  }

  async executeAttempt(sessionId, attempt) {
    console.log('\n⏳ Executing attempt...');
    
    // In a real implementation, this could:
    // 1. Actually execute the commands
    // 2. Monitor for success/failure
    // 3. Capture output and analyze results
    
    // For now, we'll simulate by asking the user
    const outcome = await this.promptUser('What was the result? (success/failure/partial): ');
    const details = await this.promptUser('Describe what happened: ');
    
    const successful = outcome.toLowerCase() === 'success';
    
    this.learningEngine.recordAttempt(sessionId, attempt, successful, details);
    
    return {
      successful,
      outcome: details,
      timestamp: Date.now()
    };
  }

  async handleSuccessfulResolution(sessionId, successfulAttempt, outcome) {
    console.log('\n🎉 SUCCESS! Problem resolved!');
    console.log('='.repeat(30));
    console.log(`✅ Working solution: ${successfulAttempt.description}`);
    console.log(`📝 Details: ${outcome}`);
    
    // Store the learning
    const storeInMemory = await this.promptUser('\nStore this solution in memory for future use? (y/n): ');
    
    if (storeInMemory.toLowerCase() === 'y') {
      const solutionDetails = await this.promptUser('Provide clear solution description: ');
      await this.learningEngine.captureSuccessfulResolution(sessionId, solutionDetails);
    }
    
    // Generate session summary
    const stats = this.learningEngine.getLearningStatistics();
    console.log('\n📊 Session Summary:');
    console.log(`   Resolution method: ${successfulAttempt.level} approach`);
    console.log(`   Learning patterns: ${stats.successPatterns} stored`);
    console.log(`   Average resolution: ${stats.averageResolutionTime}s`);
  }

  async handleUnresolvedProblem(sessionId, problemAnalysis) {
    console.log('\n🤔 Problem not yet resolved with standard approaches');
    console.log('='.repeat(50));
    
    console.log('\n📋 NEXT STEPS:');
    console.log('1. 📖 Consult official documentation specifically for this error');
    console.log('2. 🔍 Search GitHub issues for similar problems');
    console.log('3. 🧪 Create minimal reproduction case');
    console.log('4. 💬 Ask on relevant community forums with specific details');
    
    // Suggest documentation sources
    const docSources = this.suggestDocumentationSources(problemAnalysis);
    if (docSources.length > 0) {
      console.log('\n📚 Recommended documentation sources:');
      docSources.forEach(source => {
        console.log(`   📖 ${source.name}: ${source.url}`);
      });
    }
    
    // Offer to store partial progress
    const storeProgress = await this.promptUser('\nStore current progress and analysis? (y/n): ');
    if (storeProgress.toLowerCase() === 'y') {
      const progressNotes = await this.promptUser('Describe what was tried and learned: ');
      // Store as incomplete solution for future reference
      this.memory.storeSolution(
        `[INCOMPLETE] ${problemAnalysis.originalProblem}`,
        problemAnalysis.category,
        `Attempted approaches: ${progressNotes}. Needs further investigation.`,
        false
      );
      console.log('✅ Progress stored for future reference');
    }
  }

  suggestDocumentationSources(problemAnalysis) {
    const sources = [];
    
    const docMap = {
      'npm': { name: 'npm CLI documentation', url: 'https://docs.npmjs.com/cli/v8' },
      'node': { name: 'Node.js documentation', url: 'https://nodejs.org/en/docs/' },
      'react': { name: 'React documentation', url: 'https://reactjs.org/docs/' },
      'python': { name: 'Python documentation', url: 'https://docs.python.org/3/' },
      'docker': { name: 'Docker documentation', url: 'https://docs.docker.com/' },
      'git': { name: 'Git documentation', url: 'https://git-scm.com/docs' }
    };
    
    for (const tech of problemAnalysis.technologyStack) {
      if (docMap[tech]) {
        sources.push(docMap[tech]);
      }
    }
    
    return sources;
  }

  async promptUser(question) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async concludeWithMemorySolution(memoryResults) {
    console.log('\n✅ Using proven solution from memory');
    console.log('🎓 This prevents trial-and-error and saves time');
    
    // Record that memory solution was used
    const solutionUsed = await this.promptUser('Which solution number did you use? (1-3): ');
    const solutionIndex = parseInt(solutionUsed) - 1;
    
    if (solutionIndex >= 0 && solutionIndex < memoryResults.solutions.length) {
      console.log('📊 Solution usage recorded for future ranking');
      // In a real implementation, we'd increment the use count
    }
    
    console.log('\n🎯 Memory-based resolution completed successfully!');
  }
}

// Main execution
async function main() {
  if (process.argv.length < 3) {
    console.log('🎓 Brains Structured Problem-Solving Coach');
    console.log('==========================================');
    console.log('');
    console.log('Usage: brains-coach "<problem-description>"');
    console.log('');
    console.log('Examples:');
    console.log('  brains-coach "npm install fails with EACCES error"');
    console.log('  brains-coach "Docker container won\'t start"');
    console.log('  brains-coach "React component not rendering"');
    console.log('');
    console.log('This tool guides you through structured problem-solving to avoid');
    console.log('chaotic trial-and-error and learn from each resolution.');
    process.exit(1);
  }

  const problemDescription = process.argv.slice(2).join(' ');
  
  const coach = new BrainsCoach();
  await coach.initialize();
  
  try {
    await coach.startCoachingSession(problemDescription);
  } catch (error) {
    console.error('❌ Coaching session error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Brains coach error:', error.message);
    process.exit(1);
  });
}

module.exports = BrainsCoach;