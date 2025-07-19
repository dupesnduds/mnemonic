#!/usr/bin/env node

/**
 * Brains Error Interception CLI
 * Automatically intercepts command errors and provides memory-based solutions
 * Usage: brains-intercept <command> [args...]
 * Example: brains-intercept npm install
 */

const { spawn } = require('child_process');
const { promisify } = require('util');
const readline = require('readline');
const path = require('path');
const fs = require('fs');

// Import the enhanced memory system
const EnhancedMemoryWrapper = require('../lib/enhanced_memory_wrapper.js');

class ErrorInterceptor {
  constructor() {
    this.memory = new EnhancedMemoryWrapper();
    this.initialized = false;
    this.errorPatterns = new Map();
    this.setupErrorPatterns();
  }

  async initialize() {
    try {
      await this.memory.initializeFromFile();
      this.initialized = true;
      console.log('🧠 Brains Error Interception Active');
    } catch (error) {
      console.warn('⚠️  Memory system unavailable, running in basic mode');
    }
  }

  setupErrorPatterns() {
    // Common error patterns that we can automatically detect and categorize
    this.errorPatterns.set(/npm.*ERR.*ENOENT/i, {
      category: 'build',
      type: 'missing_file',
      context: 'npm package manager'
    });
    
    this.errorPatterns.set(/npm.*ERR.*EACCES/i, {
      category: 'build', 
      type: 'permissions',
      context: 'npm permissions error'
    });
    
    this.errorPatterns.set(/Error.*Cannot find module/i, {
      category: 'build',
      type: 'missing_dependency', 
      context: 'Node.js module resolution'
    });
    
    this.errorPatterns.set(/gyp.*ERR.*build.*error/i, {
      category: 'build',
      type: 'compilation_error',
      context: 'node-gyp compilation'
    });
    
    this.errorPatterns.set(/ETIMEDOUT|ENOTFOUND|ECONNREFUSED/i, {
      category: 'networking',
      type: 'connection_error',
      context: 'network connectivity'
    });
    
    this.errorPatterns.set(/Authentication.*failed|401.*Unauthorized/i, {
      category: 'authentication',
      type: 'auth_error',
      context: 'authentication failure'
    });
    
    this.errorPatterns.set(/database.*connection|DB.*error/i, {
      category: 'database',
      type: 'connection_error',
      context: 'database connectivity'
    });
    
    this.errorPatterns.set(/Permission.*denied|403.*Forbidden/i, {
      category: 'configuration',
      type: 'permissions',
      context: 'access control'
    });
  }

  analyzeError(errorOutput) {
    const analysis = {
      errorText: errorOutput,
      category: 'errors_uncategorised',
      type: 'unknown',
      context: 'general',
      severity: 'medium',
      keywords: []
    };

    // Extract meaningful lines (skip debug/verbose output)
    const meaningfulLines = errorOutput
      .split('\n')
      .filter(line => {
        const lower = line.toLowerCase();
        return (lower.includes('error') || 
                lower.includes('fail') || 
                lower.includes('warn') ||
                lower.includes('enoent') ||
                lower.includes('eacces')) && 
               !lower.includes('debug') &&
               line.trim().length > 10;
      })
      .slice(0, 5); // Take first 5 meaningful error lines

    const condensedError = meaningfulLines.join(' ').substring(0, 500);
    analysis.condensedError = condensedError;

    // Pattern matching for categorization
    for (const [pattern, info] of this.errorPatterns) {
      if (pattern.test(condensedError)) {
        analysis.category = info.category;
        analysis.type = info.type;
        analysis.context = info.context;
        break;
      }
    }

    // Extract keywords for context
    const words = condensedError.toLowerCase().split(/\s+/);
    analysis.keywords = words
      .filter(word => word.length > 3 && !['error', 'failed', 'warn'].includes(word))
      .slice(0, 10);

    // Determine severity
    if (condensedError.toLowerCase().includes('fatal') || 
        condensedError.toLowerCase().includes('critical')) {
      analysis.severity = 'critical';
    } else if (condensedError.toLowerCase().includes('warn')) {
      analysis.severity = 'warning';
    }

    return analysis;
  }

  async findSolutions(errorAnalysis) {
    if (!this.initialized) {
      return { suggestions: [], fallbackAdvice: this.getBasicAdvice(errorAnalysis) };
    }

    try {
      // Create a searchable problem description
      const problemDescription = `${errorAnalysis.type} ${errorAnalysis.context} ${errorAnalysis.keywords.slice(0, 5).join(' ')}`;
      
      // Get AI-powered suggestions
      const suggestions = this.memory.getSuggestions(
        problemDescription,
        `${errorAnalysis.context} severity:${errorAnalysis.severity} tech:${this.detectTechnologyStack(errorAnalysis.errorText)}`,
        3
      );

      return {
        suggestions: suggestions.suggestions || [],
        contextAnalysis: suggestions.context_analysis,
        fallbackAdvice: this.getBasicAdvice(errorAnalysis)
      };
    } catch (error) {
      console.warn('⚠️  Error fetching solutions:', error.message);
      return { suggestions: [], fallbackAdvice: this.getBasicAdvice(errorAnalysis) };
    }
  }

  detectTechnologyStack(errorText) {
    const lower = errorText.toLowerCase();
    const technologies = [];
    
    if (lower.includes('npm') || lower.includes('node')) technologies.push('nodejs');
    if (lower.includes('python') || lower.includes('pip')) technologies.push('python');
    if (lower.includes('react') || lower.includes('jsx')) technologies.push('react');
    if (lower.includes('docker') || lower.includes('container')) technologies.push('docker');
    if (lower.includes('git') || lower.includes('github')) technologies.push('git');
    if (lower.includes('mysql') || lower.includes('postgres')) technologies.push('database');
    
    return technologies.join(',') || 'general';
  }

  getBasicAdvice(errorAnalysis) {
    const advice = [];
    
    switch (errorAnalysis.category) {
      case 'build':
        advice.push('🔧 Try: npm clean-install or rm -rf node_modules && npm install');
        advice.push('🔧 Check: Node.js and npm versions compatibility');
        break;
      case 'networking':
        advice.push('🌐 Check: Internet connection and firewall settings');
        advice.push('🌐 Try: Different DNS servers or VPN');
        break;
      case 'authentication':
        advice.push('🔐 Check: API keys, tokens, and credentials');
        advice.push('🔐 Try: Re-authenticate or refresh tokens');
        break;
      case 'database':
        advice.push('🗄️  Check: Database server is running and accessible');
        advice.push('🗄️  Verify: Connection strings and credentials');
        break;
      default:
        advice.push('💡 Search: Official documentation for specific error');
        advice.push('💡 Try: Minimal reproduction to isolate the issue');
    }
    
    return advice;
  }

  formatSolutions(errorAnalysis, solutions) {
    console.log('\n🚨 Error Detected & Analyzed:');
    console.log(`📂 Category: ${errorAnalysis.category}`);
    console.log(`🏷️  Type: ${errorAnalysis.type}`);
    console.log(`📊 Severity: ${errorAnalysis.severity}`);
    
    if (solutions.suggestions && solutions.suggestions.length > 0) {
      console.log('\n🧠 Memory-Based Solutions:');
      solutions.suggestions.forEach((suggestion, index) => {
        console.log(`\n${index + 1}. 📝 Solution (Score: ${(suggestion.score * 100).toFixed(0)}%):`);
        console.log(`   ${suggestion.solution}`);
        console.log(`   📊 Source: ${suggestion.source} | Uses: ${suggestion.use_count}`);
      });
    } else {
      console.log('\n💡 Basic Troubleshooting Advice:');
      solutions.fallbackAdvice.forEach(advice => {
        console.log(`   ${advice}`);
      });
    }

    if (solutions.contextAnalysis) {
      console.log('\n🔍 Context Analysis:');
      if (solutions.contextAnalysis.technologies && solutions.contextAnalysis.technologies.length > 0) {
        console.log(`   Technologies: ${solutions.contextAnalysis.technologies.join(', ')}`);
      }
      if (solutions.contextAnalysis.environment !== 'unknown') {
        console.log(`   Environment: ${solutions.contextAnalysis.environment}`);
      }
    }
  }

  async promptForSolution() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      console.log('\n🤔 Did you find a solution? Would you like to store it for future use?');
      rl.question('Enter solution (or press Enter to skip): ', (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  async storeLearning(errorAnalysis, solution) {
    if (!solution || !this.initialized) return;

    try {
      const problemDescription = `${errorAnalysis.type} in ${errorAnalysis.context}`;
      const success = this.memory.storeSolution(
        problemDescription,
        errorAnalysis.category,
        solution,
        false // Store as project-specific initially
      );

      if (success) {
        console.log('✅ Solution stored in memory for future reference!');
      } else {
        console.log('⚠️  Failed to store solution in memory');
      }
    } catch (error) {
      console.warn('⚠️  Error storing solution:', error.message);
    }
  }

  async interceptCommand(command, args) {
    console.log(`🚀 Running: ${command} ${args.join(' ')}`);
    
    return new Promise((resolve) => {
      let errorOutput = '';
      let stdOutput = '';
      
      const child = spawn(command, args, {
        stdio: ['inherit', 'pipe', 'pipe'],
        shell: true
      });

      // Capture stdout and stderr
      child.stdout.on('data', (data) => {
        const output = data.toString();
        process.stdout.write(output);
        stdOutput += output;
      });

      child.stderr.on('data', (data) => {
        const output = data.toString();
        process.stderr.write(output);
        errorOutput += output;
      });

      child.on('close', async (code) => {
        if (code !== 0 && errorOutput.trim()) {
          // Error occurred - analyze and provide solutions
          console.log('\n' + '='.repeat(60));
          console.log('🧠 BRAINS ERROR ANALYSIS');
          console.log('='.repeat(60));
          
          const errorAnalysis = this.analyzeError(errorOutput);
          const solutions = await this.findSolutions(errorAnalysis);
          
          this.formatSolutions(errorAnalysis, solutions);
          
          // Prompt for learning if we don't have good solutions
          if (!solutions.suggestions || solutions.suggestions.length === 0) {
            const userSolution = await this.promptForSolution();
            if (userSolution) {
              await this.storeLearning(errorAnalysis, userSolution);
            }
          }
          
          console.log('\n' + '='.repeat(60));
        } else if (code === 0) {
          console.log('\n✅ Command completed successfully!');
        }
        
        resolve(code);
      });

      child.on('error', (error) => {
        console.error(`❌ Failed to execute command: ${error.message}`);
        resolve(1);
      });
    });
  }
}

// Main execution
async function main() {
  if (process.argv.length < 3) {
    console.log('Usage: brains-intercept <command> [args...]');
    console.log('Example: brains-intercept npm install');
    console.log('Example: brains-intercept node app.js');
    process.exit(1);
  }

  const interceptor = new ErrorInterceptor();
  await interceptor.initialize();

  const command = process.argv[2];
  const args = process.argv.slice(3);

  const exitCode = await interceptor.interceptCommand(command, args);
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Brains interceptor error:', error.message);
    process.exit(1);
  });
}

module.exports = ErrorInterceptor;