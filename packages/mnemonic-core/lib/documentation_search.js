/**
 * Documentation Search System for Brains Memory System
 * Searches trusted documentation sources like MDN, Node.js docs, framework docs
 */

const fs = require('fs');
const yaml = require('js-yaml');
const https = require('https');
const { URL } = require('url');

class DocumentationSearch {
  constructor(configPath = './brains-config.yaml') {
    this.configPath = configPath;
    this.config = this.loadConfig();
    this.retryManager = null;
    this.searchCache = new Map();
    this.documentationSources = this.initializeDocumentationSources();
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
   * Initialize documentation sources configuration
   * @returns {Object} Documentation sources configuration
   */
  initializeDocumentationSources() {
    const defaultSources = {
      mdn: {
        name: 'MDN Web Docs',
        base_url: 'https://developer.mozilla.org',
        search_url: 'https://developer.mozilla.org/api/v1/search',
        trust_score: 1.0,
        categories: ['web', 'javascript', 'css', 'html', 'browser', 'api'],
        enabled: true,
        api_type: 'json' // Has actual JSON API
      },
      stackoverflow: {
        name: 'Stack Overflow',
        base_url: 'https://stackoverflow.com',
        search_url: 'https://api.stackexchange.com/2.3/search/advanced',
        trust_score: 0.80,
        categories: ['programming', 'debugging', 'solutions', 'community'],
        enabled: true,
        api_type: 'json',
        api_params: {
          site: 'stackoverflow',
          sort: 'relevance',
          pagesize: 3
        }
      },
      nodejs_simple: {
        name: 'Node.js Documentation (Simple)',
        base_url: 'https://nodejs.org',
        search_url: 'https://nodejs.org/docs/latest/api/',
        trust_score: 1.0,
        categories: ['nodejs', 'javascript', 'backend', 'api'],
        enabled: true,
        api_type: 'fallback' // Use fallback method for now
      },
      react_simple: {
        name: 'React Documentation (Simple)',
        base_url: 'https://react.dev',
        search_url: 'https://react.dev/learn/',
        trust_score: 0.95,
        categories: ['react', 'javascript', 'frontend', 'component'],
        enabled: true,
        api_type: 'fallback'
      },
      vue: {
        name: 'Vue.js Documentation',
        base_url: 'https://vuejs.org',
        search_url: 'https://vuejs.org/guide/',
        trust_score: 0.90,
        categories: ['vue', 'javascript', 'frontend', 'component'],
        enabled: true
      },
      angular: {
        name: 'Angular Documentation',
        base_url: 'https://angular.io',
        search_url: 'https://angular.io/docs',
        trust_score: 0.90,
        categories: ['angular', 'typescript', 'frontend', 'component'],
        enabled: true
      },
      python: {
        name: 'Python Documentation',
        base_url: 'https://docs.python.org',
        search_url: 'https://docs.python.org/3/',
        trust_score: 1.0,
        categories: ['python', 'backend', 'api', 'stdlib'],
        enabled: true
      },
      django: {
        name: 'Django Documentation',
        base_url: 'https://docs.djangoproject.com',
        search_url: 'https://docs.djangoproject.com/en/stable/',
        trust_score: 0.95,
        categories: ['django', 'python', 'backend', 'web'],
        enabled: true
      },
      flask: {
        name: 'Flask Documentation',
        base_url: 'https://flask.palletsprojects.com',
        search_url: 'https://flask.palletsprojects.com/en/latest/',
        trust_score: 0.90,
        categories: ['flask', 'python', 'backend', 'web'],
        enabled: true
      },
      express: {
        name: 'Express.js Documentation',
        base_url: 'https://expressjs.com',
        search_url: 'https://expressjs.com/en/api.html',
        trust_score: 0.90,
        categories: ['express', 'nodejs', 'backend', 'web'],
        enabled: true
      },
      typescript: {
        name: 'TypeScript Documentation',
        base_url: 'https://www.typescriptlang.org',
        search_url: 'https://www.typescriptlang.org/docs/',
        trust_score: 0.95,
        categories: ['typescript', 'javascript', 'types', 'language'],
        enabled: true
      }
    };

    // Merge with user configuration
    const userSources = this.config.documentation?.sources || {};
    return { ...defaultSources, ...userSources };
  }

  /**
   * Initialize dependencies (called by layered retrieval system)
   */
  initialize(retryManager) {
    this.retryManager = retryManager;
  }

  /**
   * Search documentation sources for solutions
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Search results
   */
  async searchDocumentation(query, options = {}) {
    const searchConfig = {
      maxResults: options.maxResults || 10,
      categories: options.categories || [],
      sources: options.sources || [],
      trustThreshold: options.trustThreshold || 0.3, // Lowered from 0.7 to 0.3
      ...options
    };

    console.log(`🔍 Documentation search config:`, {
      maxResults: searchConfig.maxResults,
      trustThreshold: searchConfig.trustThreshold,
      categories: searchConfig.categories,
      sources: searchConfig.sources
    });

    // Check cache first
    const cacheKey = this.generateCacheKey(query, searchConfig);
    const cachedResult = this.getCachedResult(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    const searchResults = [];
    const applicableSources = this.getApplicableSources(query, searchConfig);

    console.log(`🔍 Searching documentation sources: ${applicableSources.map(s => s.name).join(', ')}`);

    // Search each applicable source
    for (const source of applicableSources) {
      try {
        const sourceResults = await this.searchDocumentationSource(source, query, searchConfig);
        console.log(`📊 ${source.name}: ${sourceResults.length} results found`);
        searchResults.push(...sourceResults);
      } catch (error) {
        console.warn(`❌ Documentation search failed for ${source.name}:`, error.message);
        // Continue with other sources
      }
    }

    console.log(`📊 Total raw results: ${searchResults.length}`);

    // Filter by trust threshold and sort
    const filteredResults = searchResults.filter(result => {
      const passes = result.trust_score >= searchConfig.trustThreshold;
      if (!passes) {
        console.log(`❌ Filtered out: "${result.title}" (trust: ${result.trust_score} < ${searchConfig.trustThreshold})`);
      }
      return passes;
    });

    console.log(`📊 After trust filtering: ${filteredResults.length}`);

    const sortedResults = filteredResults.sort((a, b) => {
      const scoreDiff = b.trust_score - a.trust_score;
      if (Math.abs(scoreDiff) < 0.1) {
        return b.relevance_score - a.relevance_score;
      }
      return scoreDiff;
    });

    console.log(`📊 Final sorted results: ${sortedResults.length}`);

    const finalResults = {
      query: query,
      total_results: sortedResults.length,
      results: sortedResults.slice(0, searchConfig.maxResults),
      sources_searched: applicableSources.map(s => s.name),
      search_metadata: {
        cached: false,
        timestamp: new Date().toISOString(),
        trust_threshold: searchConfig.trustThreshold,
        categories: searchConfig.categories
      }
    };

    // Cache the results
    this.cacheResult(cacheKey, finalResults);

    return finalResults;
  }

  /**
   * Get applicable documentation sources for a query
   * @param {string} query - Search query
   * @param {Object} config - Search configuration
   * @returns {Array} Applicable sources
   */
  getApplicableSources(query, config) {
    const queryLower = query.toLowerCase();
    const sources = Object.values(this.documentationSources).filter(source => source.enabled);

    // If specific sources requested, use those
    if (config.sources && config.sources.length > 0) {
      return sources.filter(source => 
        config.sources.includes(source.name.toLowerCase()) ||
        config.sources.includes(Object.keys(this.documentationSources).find(key => 
          this.documentationSources[key] === source
        ))
      );
    }

    // If categories specified, filter by categories
    if (config.categories && config.categories.length > 0) {
      return sources.filter(source => 
        source.categories && source.categories.some && source.categories.some(category => 
          config.categories.includes(category)
        )
      );
    }

    // Auto-detect relevant sources based on query keywords
    const relevantSources = sources.filter(source => {
      return source.categories && source.categories.some && source.categories.some(category => {
        const keywords = this.getCategoryKeywords(category);
        return keywords.some(keyword => queryLower.includes(keyword));
      });
    });

    // If no specific matches, return high-trust general sources
    if (relevantSources.length === 0) {
      return sources.filter(source => 
        source.trust_score >= 0.95 && 
        ['mdn', 'nodejs', 'python'].includes(source.name.toLowerCase())
      );
    }

    return relevantSources;
  }

  /**
   * Get category keywords for source matching
   * @param {string} category - Category name
   * @returns {Array} Category keywords
   */
  getCategoryKeywords(category) {
    const keywordMap = {
      web: ['web', 'browser', 'dom', 'html', 'css', 'fetch', 'xhr'],
      javascript: ['javascript', 'js', 'es6', 'es2015', 'promise', 'async', 'function'],
      react: ['react', 'jsx', 'component', 'hook', 'state', 'props'],
      vue: ['vue', 'vuejs', 'component', 'directive', 'reactive'],
      angular: ['angular', 'typescript', 'component', 'service', 'module'],
      nodejs: ['node', 'nodejs', 'npm', 'require', 'module', 'server'],
      python: ['python', 'py', 'import', 'def', 'class', 'pip'],
      django: ['django', 'model', 'view', 'template', 'orm'],
      flask: ['flask', 'route', 'request', 'response', 'blueprint'],
      express: ['express', 'route', 'middleware', 'request', 'response'],
      typescript: ['typescript', 'ts', 'type', 'interface', 'generic']
    };

    return keywordMap[category] || [category];
  }

  /**
   * Search a specific documentation source
   * @param {Object} source - Documentation source
   * @param {string} query - Search query
   * @param {Object} config - Search configuration
   * @returns {Promise<Array>} Search results
   */
  async searchDocumentationSource(source, query, config) {
    console.log(`🔍 Searching ${source.name} (API type: ${source.api_type || 'generic'})`);
    
    // Different sources require different search strategies
    switch (source.name.toLowerCase()) {
      case 'mdn web docs':
        return await this.searchMDN(source, query, config);
      case 'stack overflow':
        return await this.searchStackOverflow(source, query, config);
      case 'node.js documentation (simple)':
        return await this.searchNodeJSSimple(source, query, config);
      case 'react documentation (simple)':
        return await this.searchReactSimple(source, query, config);
      default:
        // Use fallback method for sources without specific implementation
        if (source.api_type === 'fallback') {
          return await this.searchFallbackDocumentation(source, query, config);
        }
        return await this.searchGenericDocumentation(source, query, config);
    }
  }

  /**
   * Search Stack Overflow using their API
   * @param {Object} source - Stack Overflow source configuration
   * @param {string} query - Search query
   * @param {Object} config - Search configuration
   * @returns {Promise<Array>} Search results
   */
  async searchStackOverflow(source, query, config) {
    try {
      const searchUrl = `${source.search_url}?q=${encodeURIComponent(query)}&site=${source.api_params.site}&sort=${source.api_params.sort}&pagesize=${source.api_params.pagesize}&filter=withbody`;
      
      console.log(`📡 Stack Overflow API: ${searchUrl}`);
      
      const response = await this.makeDocumentationRequest(searchUrl);
      
      const results = [];
      
      if (response.items && Array.isArray(response.items)) {
        for (const item of response.items) {
          if (item.is_answered && item.accepted_answer_id) {
            results.push({
              type: 'documentation',
              source: source.name,
              title: this.sanitizeText(item.title),
              url: item.link,
              summary: this.sanitizeText(item.body ? item.body.substring(0, 200) : 'Stack Overflow solution'),
              content: this.sanitizeText(item.body || 'Stack Overflow question with accepted answer'),
              trust_score: source.trust_score,
              relevance_score: this.calculateRelevanceScore(query, item.title + ' ' + (item.body || '')),
              metadata: {
                score: item.score,
                answer_count: item.answer_count,
                view_count: item.view_count,
                tags: item.tags || [],
                source_type: 'stackoverflow_api'
              }
            });
          }
        }
      }
      
      console.log(`✅ Stack Overflow: Found ${results.length} results`);
      return results.slice(0, config.maxResults || 3);
      
    } catch (error) {
      console.warn(`Stack Overflow search failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Parse DeepWiki HTML search results
   * @param {string} html - HTML content from deepwiki.com
   * @param {string} query - Original search query
   * @returns {Array} Parsed search results
   */
  parseDeepWikiHTML(html, query) {
    const results = [];
    
    try {
      // Simple HTML parsing for common patterns
      // Look for title and link patterns in search results
      const titleRegex = /<h[23][^>]*>([^<]+)<\/h[23]>/gi;
      const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
      
      let titleMatch;
      let linkMatches = [];
      
      // Extract titles
      while ((titleMatch = titleRegex.exec(html)) !== null) {
        if (titleMatch[1] && titleMatch[1].length > 10) {
          results.push({
            type: 'documentation',
            source: 'DeepWiki Documentation',
            title: this.sanitizeText(titleMatch[1]),
            url: 'https://deepwiki.com/search?q=' + encodeURIComponent(query),
            summary: `Documentation for ${this.sanitizeText(titleMatch[1])}`,
            content: `Detailed documentation and examples for ${this.sanitizeText(titleMatch[1])}`,
            trust_score: 0.85,
            relevance_score: this.calculateRelevanceScore(query, titleMatch[1]),
            metadata: {
              source_type: 'deepwiki_scraped',
              extraction_method: 'html_parsing'
            }
          });
        }
      }
      
      // Extract links if no titles found
      if (results.length === 0) {
        let linkMatch;
        while ((linkMatch = linkRegex.exec(html)) !== null && linkMatches.length < 3) {
          if (linkMatch[2] && linkMatch[2].length > 5) {
            linkMatches.push({
              url: linkMatch[1],
              text: this.sanitizeText(linkMatch[2])
            });
          }
        }
        
        for (const link of linkMatches) {
          results.push({
            type: 'documentation',
            source: 'DeepWiki Documentation',
            title: link.text,
            url: link.url.startsWith('http') ? link.url : 'https://deepwiki.com' + link.url,
            summary: `Documentation link: ${link.text}`,
            content: `Documentation resource for ${link.text}`,
            trust_score: 0.80,
            relevance_score: this.calculateRelevanceScore(query, link.text),
            metadata: {
              source_type: 'deepwiki_scraped',
              extraction_method: 'link_parsing'
            }
          });
        }
      }
      
    } catch (parseError) {
      console.warn('DeepWiki HTML parsing failed:', parseError.message);
    }
    
    return results;
  }

  /**
   * Fallback search for DeepWiki when web scraping fails
   */
  async searchDeepWikiFallback(source, query, config) {
    const programmingTopics = [
      'javascript', 'python', 'node.js', 'react', 'vue', 'angular', 
      'api', 'rest', 'graphql', 'database', 'sql', 'mongodb',
      'docker', 'kubernetes', 'aws', 'deployment', 'testing'
    ];
    
    const queryLower = query.toLowerCase();
    const relevantTopics = programmingTopics.filter(topic => 
      queryLower.includes(topic) || topic.includes(queryLower.split(' ')[0])
    );
    
    const results = [];
    
    for (const topic of relevantTopics.slice(0, 2)) {
      results.push({
        type: 'documentation',
        source: source.name,
        title: `${topic.charAt(0).toUpperCase() + topic.slice(1)} Documentation`,
        url: `${source.base_url}/docs/${topic}`,
        summary: `Comprehensive ${topic} documentation from DeepWiki`,
        content: `Documentation for ${topic} including APIs, examples, and best practices`,
        trust_score: source.trust_score * 0.9, // Slightly lower for fallback
        relevance_score: this.calculateRelevanceScore(query, `${topic} documentation`),
        metadata: {
          topic: topic,
          source_type: 'deepwiki_fallback'
        }
      });
    }
    
    return results;
  }

  /**
   * Sanitize text extracted from HTML
   * @param {string} text - Raw text
   * @returns {string} Sanitized text
   */
  sanitizeText(text) {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Search MDN Web Docs
   * @param {Object} source - MDN source configuration
   * @param {string} query - Search query
   * @param {Object} config - Search configuration
   * @returns {Promise<Array>} Search results
   */
  async searchMDN(source, query, config) {
    const searchUrl = `${source.search_url}?q=${encodeURIComponent(query)}&locale=en-US`;
    
    try {
      const response = await this.makeDocumentationRequest(searchUrl);
      
      return response.documents.slice(0, config.maxResults).map(doc => ({
        type: 'documentation',
        source: source.name,
        title: doc.title,
        url: `${source.base_url}${doc.mdn_url}`,
        summary: doc.summary,
        content: doc.summary, // MDN provides summaries
        trust_score: source.trust_score,
        relevance_score: this.calculateRelevanceScore(query, doc.title + ' ' + doc.summary),
        metadata: {
          locale: doc.locale,
          tags: doc.tags || [],
          last_modified: doc.last_modified
        }
      }));
    } catch (error) {
      console.warn(`MDN search failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Search Node.js documentation (simplified approach)
   * @param {Object} source - Node.js source configuration
   * @param {string} query - Search query
   * @param {Object} config - Search configuration
   * @returns {Promise<Array>} Search results
   */
  async searchNodeJSSimple(source, query, config) {
    console.log(`📖 Node.js Simple: Generating results for "${query}"`);
    
    // For Node.js, we'll search the API documentation structure
    const apiModules = [
      'fs', 'http', 'https', 'path', 'url', 'crypto', 'stream', 'events',
      'util', 'os', 'process', 'child_process', 'cluster', 'net', 'tls',
      'zlib', 'readline', 'vm', 'worker_threads', 'async_hooks'
    ];

    const queryLower = query.toLowerCase();
    const relevantModules = apiModules.filter(module => 
      queryLower.includes(module) || 
      module.includes(queryLower.split(' ')[0])
    );

    const results = [];
    
    for (const module of relevantModules.slice(0, 3)) {
      const url = `${source.base_url}/docs/latest/api/${module}.html`;
      
      results.push({
        type: 'documentation',
        source: source.name,
        title: `Node.js ${module} module`,
        url: url,
        summary: `Official Node.js documentation for the ${module} module`,
        content: `Documentation for Node.js ${module} module including API methods, properties, and usage examples`,
        trust_score: source.trust_score,
        relevance_score: this.calculateRelevanceScore(query, `${module} node.js api`),
        metadata: {
          module: module,
          version: 'latest',
          type: 'api',
          source_type: 'nodejs_simple'
        }
      });
    }

    console.log(`✅ Node.js Simple: Found ${results.length} results`);
    return results;
  }

  /**
   * Search React documentation (simplified approach)
   * @param {Object} source - React source configuration
   * @param {string} query - Search query
   * @param {Object} config - Search configuration
   * @returns {Promise<Array>} Search results
   */
  async searchReactSimple(source, query, config) {
    console.log(`📖 React Simple: Generating results for "${query}"`);
    
    const reactConcepts = [
      'components', 'hooks', 'state', 'props', 'jsx', 'useeffect', 'usestate',
      'context', 'router', 'forms', 'events', 'lifecycle', 'performance',
      'testing', 'typescript', 'patterns'
    ];

    const queryLower = query.toLowerCase();
    const relevantConcepts = reactConcepts.filter(concept => 
      queryLower.includes(concept) || 
      concept.includes(queryLower.split(' ')[0])
    );

    const results = [];
    
    for (const concept of relevantConcepts.slice(0, 3)) {
      const url = `${source.base_url}/${concept}`;
      
      results.push({
        type: 'documentation',
        source: source.name,
        title: `React ${concept.charAt(0).toUpperCase() + concept.slice(1)}`,
        url: url,
        summary: `Official React documentation about ${concept}`,
        content: `Learn about React ${concept} including best practices, examples, and common patterns`,
        trust_score: source.trust_score,
        relevance_score: this.calculateRelevanceScore(query, `react ${concept}`),
        metadata: {
          concept: concept,
          type: 'guide',
          source_type: 'react_simple'
        }
      });
    }

    console.log(`✅ React Simple: Found ${results.length} results`);
    return results;
  }

  /**
   * Fallback documentation search for sources without specific implementation
   * @param {Object} source - Documentation source
   * @param {string} query - Search query
   * @param {Object} config - Search configuration
   * @returns {Promise<Array>} Search results
   */
  async searchFallbackDocumentation(source, query, config) {
    console.log(`📖 Fallback: Generating results for ${source.name}`);
    
    const results = [];
    
    // Generate a basic result based on the source and query
    const relevantCategories = (source.categories || []).filter(category => {
      const keywords = this.getCategoryKeywords(category);
      return keywords.some(keyword => query.toLowerCase().includes(keyword));
    });

    for (const category of relevantCategories.slice(0, 2)) {
      results.push({
        type: 'documentation',
        source: source.name,
        title: `${source.name} - ${category} documentation`,
        url: source.base_url,
        summary: `Official ${source.name} documentation for ${category}-related topics`,
        content: `Comprehensive documentation and guides for ${category} development using ${source.name}`,
        trust_score: source.trust_score * 0.7, // Lower trust for fallback
        relevance_score: this.calculateRelevanceScore(query, `${category} ${source.name}`),
        metadata: {
          category: category,
          source_type: 'fallback_documentation'
        }
      });
    }

    console.log(`✅ Fallback: Generated ${results.length} results`);
    return results;
  }

  /**
   * Search generic documentation source with web scraping
   * @param {Object} source - Documentation source
   * @param {string} query - Search query
   * @param {Object} config - Search configuration
   * @returns {Promise<Array>} Search results
   */
  async searchGenericDocumentation(source, query, config) {
    const results = [];
    
    try {
      // Try to fetch the documentation page
      let searchUrl = source.search_url;
      if (searchUrl.includes('?')) {
        searchUrl += `&q=${encodeURIComponent(query)}`;
      } else {
        searchUrl += `?q=${encodeURIComponent(query)}`;
      }
      
      const response = await this.makeDocumentationRequest(searchUrl);
      
      if (response.html) {
        const scrapedResults = this.parseGenericDocumentationHTML(response.html, source, query);
        results.push(...scrapedResults);
      }
      
    } catch (error) {
      console.warn(`Generic documentation search failed for ${source.name}: ${error.message}`);
    }
    
    // Fallback to structured results if scraping fails or returns no results
    if (results.length === 0) {
      const fallbackResults = this.generateFallbackDocumentation(source, query, config);
      results.push(...fallbackResults);
    }

    return results.slice(0, config.maxResults || 3);
  }

  /**
   * Parse generic documentation HTML
   * @param {string} html - HTML content
   * @param {Object} source - Documentation source
   * @param {string} query - Search query
   * @returns {Array} Parsed results
   */
  parseGenericDocumentationHTML(html, source, query) {
    const results = [];
    
    try {
      // Extract article/section titles and content
      const articleRegex = /<(?:article|section)[^>]*>(.*?)<\/(?:article|section)>/gis;
      const titleRegex = /<h[1-4][^>]*>([^<]+)<\/h[1-4]>/gi;
      const contentRegex = /<p[^>]*>([^<]+)<\/p>/gi;
      
      let articleMatch;
      while ((articleMatch = articleRegex.exec(html)) !== null && results.length < 3) {
        const articleHTML = articleMatch[1];
        
        // Extract title from article
        const titleMatch = titleRegex.exec(articleHTML);
        if (titleMatch && titleMatch[1]) {
          const title = this.sanitizeText(titleMatch[1]);
          
          // Extract content paragraphs
          let content = '';
          let contentMatch;
          const paragraphs = [];
          
          while ((contentMatch = contentRegex.exec(articleHTML)) !== null && paragraphs.length < 3) {
            paragraphs.push(this.sanitizeText(contentMatch[1]));
          }
          
          content = paragraphs.join(' ');
          
          if (title.length > 5 && content.length > 20) {
            results.push({
              type: 'documentation',
              source: source.name,
              title: title,
              url: source.base_url,
              summary: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
              content: content,
              trust_score: source.trust_score,
              relevance_score: this.calculateRelevanceScore(query, title + ' ' + content),
              metadata: {
                source_type: 'scraped_documentation',
                extraction_method: 'html_parsing'
              }
            });
          }
        }
      }
      
    } catch (parseError) {
      console.warn(`HTML parsing failed for ${source.name}:`, parseError.message);
    }
    
    return results;
  }

  /**
   * Generate fallback documentation results
   * @param {Object} source - Documentation source
   * @param {string} query - Search query
   * @param {Object} config - Search configuration
   * @returns {Array} Fallback results
   */
  generateFallbackDocumentation(source, query, config) {
    const results = [];
    
    // Generate result based on source categories and query
    const relevantCategories = (source.categories || []).filter(category => {
      const keywords = this.getCategoryKeywords(category);
      return keywords.some(keyword => query.toLowerCase().includes(keyword));
    });

    for (const category of relevantCategories.slice(0, 2)) {
      results.push({
        type: 'documentation',
        source: source.name,
        title: `${source.name} - ${category} documentation`,
        url: source.base_url,
        summary: `Official ${source.name} documentation for ${category}-related topics`,
        content: `Comprehensive documentation and guides for ${category} development using ${source.name}`,
        trust_score: source.trust_score * 0.8, // Lower trust for fallback
        relevance_score: this.calculateRelevanceScore(query, `${category} ${source.name}`),
        metadata: {
          category: category,
          source_type: 'fallback_documentation'
        }
      });
    }

    return results;
  }

  /**
   * Make HTTP request to documentation API
   * @param {string} url - Request URL
   * @returns {Promise<Object>} Response data
   */
  async makeDocumentationRequest(url) {
    const operation = async () => {
      return new Promise((resolve, reject) => {
        const headers = {
          'User-Agent': 'Brains-Memory-System/1.0',
          'Accept': 'application/json'
        };

        const parsedUrl = new URL(url);
        const options = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || 443,
          path: parsedUrl.pathname + parsedUrl.search,
          method: 'GET',
          headers: headers
        };

        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              const jsonData = JSON.parse(data);
              
              if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve(jsonData);
              } else {
                reject(new Error(`Documentation API error: ${res.statusCode}`));
              }
            } catch (parseError) {
              // Some documentation sources return HTML instead of JSON
              if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve({ html: data });
              } else {
                reject(new Error(`Failed to parse documentation response: ${parseError.message}`));
              }
            }
          });
        });

        req.on('error', (error) => {
          reject(error);
        });

        req.setTimeout(30000, () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });

        req.end();
      });
    };

    // Use retry manager if available
    if (this.retryManager) {
      const result = await this.retryManager.executeWithRetry('documentation', operation);
      if (result.success) {
        return result.data;
      } else {
        throw result.error;
      }
    } else {
      return await operation();
    }
  }

  /**
   * Calculate relevance score for documentation result
   * @param {string} query - Search query
   * @param {string} text - Text to score against
   * @returns {number} Relevance score
   */
  calculateRelevanceScore(query, text) {
    const queryWords = query.toLowerCase().split(/\s+/);
    const textWords = text.toLowerCase().split(/\s+/);
    
    let score = 0;
    let exactMatches = 0;
    let partialMatches = 0;

    for (const queryWord of queryWords) {
      // Exact word matches
      if (textWords.includes(queryWord)) {
        exactMatches++;
      }
      // Partial matches (word contains query word)
      else if (textWords.some(textWord => textWord.includes(queryWord))) {
        partialMatches++;
      }
    }

    // Calculate score based on matches
    score = (exactMatches * 1.0 + partialMatches * 0.5) / queryWords.length;

    // Boost score for title matches vs content matches
    if (text.split(' ').length < 20) { // Likely a title
      score *= 1.2;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Generate cache key for documentation search
   * @param {string} query - Search query
   * @param {Object} config - Search configuration
   * @returns {string} Cache key
   */
  generateCacheKey(query, config) {
    const keyData = JSON.stringify({
      query: query.toLowerCase(),
      maxResults: config.maxResults,
      categories: config.categories.sort(),
      sources: config.sources.sort(),
      trustThreshold: config.trustThreshold
    });
    
    return require('crypto').createHash('sha256').update(keyData).digest('hex').substring(0, 16);
  }

  /**
   * Get cached documentation result
   * @param {string} cacheKey - Cache key
   * @returns {Object|null} Cached result or null
   */
  getCachedResult(cacheKey) {
    const cached = this.searchCache.get(cacheKey);
    const cacheTimeout = (this.config.documentation?.cache_timeout_hours || 24) * 60 * 60 * 1000;
    
    if (cached && (Date.now() - cached.cached_at) < cacheTimeout) {
      return {
        ...cached.result,
        search_metadata: {
          ...cached.result.search_metadata,
          cached: true
        }
      };
    }
    
    if (cached) {
      this.searchCache.delete(cacheKey);
    }
    
    return null;
  }

  /**
   * Cache documentation search result
   * @param {string} cacheKey - Cache key
   * @param {Object} result - Search result
   */
  cacheResult(cacheKey, result) {
    this.searchCache.set(cacheKey, {
      result: result,
      cached_at: Date.now()
    });

    // Limit cache size
    if (this.searchCache.size > 50) {
      const oldestKey = this.searchCache.keys().next().value;
      this.searchCache.delete(oldestKey);
    }
  }

  /**
   * Get documentation sources status
   * @returns {Object} Sources status
   */
  getSourcesStatus() {
    const sources = {};
    
    for (const [key, source] of Object.entries(this.documentationSources)) {
      sources[key] = {
        name: source.name,
        enabled: source.enabled,
        trust_score: source.trust_score,
        categories: source.categories,
        base_url: source.base_url
      };
    }
    
    return sources;
  }

  /**
   * Clear documentation search cache
   */
  clearCache() {
    this.searchCache.clear();
  }

  getDefaultConfig() {
    return {
      documentation: {
        cache_timeout_hours: 24,
        require_explicit_consent: true,
        sources: {}
      }
    };
  }
}

module.exports = DocumentationSearch;