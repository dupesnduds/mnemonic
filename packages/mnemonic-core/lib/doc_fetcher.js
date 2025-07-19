const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * On-Demand Documentation Fetcher
 * Only fetches documentation when memory has no solution
 * Stores minimal references (URLs + key snippets) to avoid bloat
 */
class DocumentationFetcher {
  constructor(memoryWrapper) {
    this.memory = memoryWrapper;
    this.docCache = new Map(); // Temporary cache for current session
    this.officialSources = new Map();
    this.setupOfficialSources();
  }

  setupOfficialSources() {
    // Curated list of official documentation sources
    this.officialSources.set('npm', {
      name: 'npm CLI Documentation',
      baseUrl: 'https://docs.npmjs.com/cli/v8/commands/',
      searchUrl: 'https://docs.npmjs.com/cli/v8/',
      errorPatterns: {
        'ENOENT': 'npm-install',
        'EACCES': 'npm-install#permissions',
        'audit': 'npm-audit',
        'outdated': 'npm-outdated'
      }
    });

    this.officialSources.set('node', {
      name: 'Node.js Documentation',
      baseUrl: 'https://nodejs.org/api/',
      searchUrl: 'https://nodejs.org/en/docs/',
      errorPatterns: {
        'Cannot find module': 'modules.html#modules_require_id',
        'ERR_MODULE_NOT_FOUND': 'esm.html#esm_resolution_algorithm',
        'EADDRINUSE': 'net.html#net_server_listen'
      }
    });

    this.officialSources.set('react', {
      name: 'React Documentation',
      baseUrl: 'https://reactjs.org/docs/',
      searchUrl: 'https://reactjs.org/docs/',
      errorPatterns: {
        'hook': 'hooks-intro.html',
        'component': 'components-and-props.html',
        'render': 'rendering-elements.html'
      }
    });

    this.officialSources.set('docker', {
      name: 'Docker Documentation',
      baseUrl: 'https://docs.docker.com/reference/',
      searchUrl: 'https://docs.docker.com/',
      errorPatterns: {
        'port': 'commandline/run/#publish-or-expose-port',
        'volume': 'commandline/run/#mount-volume',
        'network': 'network/'
      }
    });

    this.officialSources.set('git', {
      name: 'Git Documentation',
      baseUrl: 'https://git-scm.com/docs/',
      searchUrl: 'https://git-scm.com/docs/',
      errorPatterns: {
        'merge conflict': 'git-merge',
        'authentication': 'gitcredentials',
        'remote': 'git-remote'
      }
    });
  }

  /**
   * Fetch documentation only when memory has no good solution
   * @param {Object} problemContext - Context about the problem
   * @param {Array} memoryResults - Results from memory lookup
   * @returns {Object} Documentation references and snippets
   */
  async fetchRelevantDocs(problemContext, memoryResults) {
    // Only fetch if memory has no high-confidence solutions
    const hasGoodMemorySolution = memoryResults.suggestions && 
                                 memoryResults.suggestions.length > 0 &&
                                 memoryResults.suggestions[0].score > 0.6;

    if (hasGoodMemorySolution) {
      return {
        shouldFetch: false,
        reason: 'Memory has high-confidence solutions',
        references: []
      };
    }

    console.log('📖 Memory has no strong solutions. Fetching relevant documentation...');

    const docReferences = [];
    
    // Identify relevant documentation sources
    const relevantSources = this.identifyRelevantSources(problemContext);
    
    for (const source of relevantSources) {
      try {
        const reference = await this.fetchSourceDocumentation(source, problemContext);
        if (reference) {
          docReferences.push(reference);
        }
      } catch (error) {
        console.warn(`⚠️  Failed to fetch from ${source.name}:`, error.message);
      }
    }

    return {
      shouldFetch: true,
      reason: 'No strong memory solutions found',
      references: docReferences,
      storeForFuture: docReferences.length > 0
    };
  }

  identifyRelevantSources(problemContext) {
    const relevantSources = [];
    
    // Check technology stack for relevant documentation
    for (const tech of problemContext.technologyStack) {
      const source = this.officialSources.get(tech);
      if (source) {
        relevantSources.push({
          technology: tech,
          ...source
        });
      }
    }

    // If no specific tech identified, try to infer from error patterns
    if (relevantSources.length === 0) {
      for (const pattern of problemContext.errorPatterns) {
        const inferredTech = this.inferTechnologyFromError(pattern);
        if (inferredTech) {
          const source = this.officialSources.get(inferredTech);
          if (source && !relevantSources.find(s => s.technology === inferredTech)) {
            relevantSources.push({
              technology: inferredTech,
              ...source
            });
          }
        }
      }
    }

    return relevantSources.slice(0, 2); // Limit to 2 sources to avoid overwhelm
  }

  inferTechnologyFromError(errorPattern) {
    const lowerPattern = errorPattern.toLowerCase();
    
    if (lowerPattern.includes('npm') || lowerPattern.includes('package')) return 'npm';
    if (lowerPattern.includes('node') || lowerPattern.includes('module')) return 'node';
    if (lowerPattern.includes('react') || lowerPattern.includes('jsx')) return 'react';
    if (lowerPattern.includes('docker') || lowerPattern.includes('container')) return 'docker';
    if (lowerPattern.includes('git') || lowerPattern.includes('repository')) return 'git';
    
    return null;
  }

  async fetchSourceDocumentation(source, problemContext) {
    // Check cache first
    const cacheKey = `${source.technology}-${problemContext.category}`;
    if (this.docCache.has(cacheKey)) {
      return this.docCache.get(cacheKey);
    }

    // Find most relevant documentation URL
    const relevantUrl = this.findRelevantDocUrl(source, problemContext);
    
    if (!relevantUrl) {
      return null;
    }

    try {
      // Fetch the documentation page
      const content = await this.fetchWebContent(relevantUrl);
      
      // Extract relevant snippets
      const relevantSnippets = this.extractRelevantSnippets(content, problemContext);
      
      const reference = {
        technology: source.technology,
        title: source.name,
        url: relevantUrl,
        snippets: relevantSnippets.slice(0, 3), // Limit to 3 snippets
        relevanceScore: this.calculateRelevanceScore(relevantSnippets, problemContext),
        fetchedAt: new Date().toISOString()
      };

      // Cache for current session
      this.docCache.set(cacheKey, reference);
      
      return reference;
      
    } catch (error) {
      console.warn(`Failed to fetch documentation from ${relevantUrl}:`, error.message);
      return null;
    }
  }

  findRelevantDocUrl(source, problemContext) {
    // Try to find specific documentation URL based on error patterns
    for (const errorPattern of problemContext.errorPatterns) {
      for (const [pattern, path] of Object.entries(source.errorPatterns)) {
        if (errorPattern.toLowerCase().includes(pattern.toLowerCase())) {
          return `${source.baseUrl}${path}`;
        }
      }
    }

    // Try to find based on category
    const categoryPaths = {
      'build': 'build',
      'networking': 'network',
      'authentication': 'auth',
      'database': 'database'
    };

    const categoryPath = categoryPaths[problemContext.category];
    if (categoryPath && source.errorPatterns[categoryPath]) {
      return `${source.baseUrl}${source.errorPatterns[categoryPath]}`;
    }

    // Default to main documentation
    return source.searchUrl;
  }

  async fetchWebContent(url) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const client = urlObj.protocol === 'https:' ? https : http;
      
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'User-Agent': 'BrainsMemorySystem/2.0 Documentation Fetcher',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        timeout: 10000 // 10 second timeout
      };

      const req = client.request(options, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          return;
        }

        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
          // Prevent downloading huge pages
          if (data.length > 500000) { // 500KB limit
            req.destroy();
            reject(new Error('Response too large'));
          }
        });

        res.on('end', () => {
          resolve(data);
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }

  extractRelevantSnippets(htmlContent, problemContext) {
    // Simple text extraction and snippet identification
    // In a production system, this could use a proper HTML parser
    
    const textContent = this.htmlToText(htmlContent);
    const lines = textContent.split('\n').map(line => line.trim()).filter(line => line.length > 20);
    
    const relevantSnippets = [];
    const searchTerms = [
      ...problemContext.errorPatterns.map(p => p.toLowerCase()),
      ...problemContext.technologyStack,
      problemContext.category
    ];

    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      
      // Check if line contains relevant terms
      const relevantTermCount = searchTerms.filter(term => 
        lowerLine.includes(term.toLowerCase())
      ).length;
      
      if (relevantTermCount > 0) {
        // Extract surrounding context (previous and next lines for context)
        const lineIndex = lines.indexOf(line);
        const contextLines = [];
        
        if (lineIndex > 0) contextLines.push(lines[lineIndex - 1]);
        contextLines.push(line);
        if (lineIndex < lines.length - 1) contextLines.push(lines[lineIndex + 1]);
        
        relevantSnippets.push({
          content: contextLines.join(' ').substring(0, 300), // Limit snippet length
          relevantTerms: searchTerms.filter(term => lowerLine.includes(term.toLowerCase())),
          score: relevantTermCount
        });
      }
    }

    // Sort by relevance score and remove duplicates
    return relevantSnippets
      .sort((a, b) => b.score - a.score)
      .filter((snippet, index, array) => 
        array.findIndex(s => s.content.substring(0, 100) === snippet.content.substring(0, 100)) === index
      );
  }

  htmlToText(html) {
    // Simple HTML to text conversion
    return html
      .replace(/<script[^>]*>.*?<\/script>/gis, '')
      .replace(/<style[^>]*>.*?<\/style>/gis, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&[a-zA-Z0-9#]+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  calculateRelevanceScore(snippets, problemContext) {
    if (snippets.length === 0) return 0;
    
    const totalScore = snippets.reduce((sum, snippet) => sum + snippet.score, 0);
    const averageScore = totalScore / snippets.length;
    
    // Normalize to 0-1 scale
    return Math.min(averageScore / searchTerms.length, 1.0);
  }

  /**
   * Store minimal documentation references in memory for future use
   * @param {Array} docReferences - Documentation references to store
   * @param {Object} problemContext - Context about the problem
   */
  async storeDocumentationReferences(docReferences, problemContext) {
    if (!docReferences || docReferences.length === 0) {
      return;
    }

    for (const ref of docReferences) {
      if (ref.relevanceScore > 0.3) { // Only store reasonably relevant docs
        const docSolution = this.createDocumentationSolution(ref);
        
        try {
          const success = this.memory.storeSolution(
            `Documentation for ${problemContext.category} in ${ref.technology}`,
            'documentation',
            docSolution,
            true // Store as global since documentation is generally applicable
          );

          if (success) {
            console.log(`📚 Stored documentation reference: ${ref.title}`);
          }
        } catch (error) {
          console.warn('⚠️  Failed to store documentation reference:', error.message);
        }
      }
    }
  }

  createDocumentationSolution(docReference) {
    const solution = {
      title: docReference.title,
      url: docReference.url,
      technology: docReference.technology,
      key_snippets: docReference.snippets.slice(0, 2).map(s => s.content),
      fetched_at: docReference.fetchedAt
    };

    return `📖 ${solution.title}: ${solution.url}\n\nKey information:\n${
      solution.key_snippets.map((snippet, i) => `${i + 1}. ${snippet}`).join('\n')
    }\n\nFetched: ${solution.fetched_at}`;
  }

  /**
   * Get documentation suggestions based on problem context
   * @param {Object} problemContext - Context about the problem
   * @returns {Array} List of suggested documentation URLs to check
   */
  getDocumentationSuggestions(problemContext) {
    const suggestions = [];
    
    for (const tech of problemContext.technologyStack) {
      const source = this.officialSources.get(tech);
      if (source) {
        suggestions.push({
          technology: tech,
          name: source.name,
          url: source.searchUrl,
          reason: `Official ${tech} documentation`
        });
      }
    }

    // Add general troubleshooting resources
    suggestions.push({
      technology: 'general',
      name: 'Stack Overflow',
      url: `https://stackoverflow.com/search?q=${encodeURIComponent(problemContext.originalProblem)}`,
      reason: 'Community solutions and discussions'
    });

    return suggestions;
  }

  /**
   * Clear documentation cache
   */
  clearCache() {
    this.docCache.clear();
    console.log('🗑️  Documentation cache cleared');
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      cachedEntries: this.docCache.size,
      availableSources: this.officialSources.size,
      technologies: Array.from(this.officialSources.keys())
    };
  }
}

module.exports = DocumentationFetcher;