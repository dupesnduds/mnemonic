/**
 * Enhanced Consent and Safety UX Manager for Brains Memory
 * Manages user consent for external searches with robust safeguards
 */

const fs = require('fs');
const yaml = require('js-yaml');
const crypto = require('crypto');
const readline = require('readline');

class ConsentManager {
  constructor(configPath = './brains-config.yaml', consentLogPath = './consent_audit.yaml') {
    this.configPath = configPath;
    this.consentLogPath = consentLogPath;
    this.config = this.loadConfig();
    this.consentCache = new Map();
    this.consentLog = this.loadConsentLog();
    this.sessionConsent = new Map();
  }

  loadConfig() {
    try {
      return yaml.load(fs.readFileSync(this.configPath, 'utf8'));
    } catch (error) {
      console.warn('Could not load config, using defaults:', error.message);
      return this.getDefaultConfig();
    }
  }

  loadConsentLog() {
    try {
      if (fs.existsSync(this.consentLogPath)) {
        return yaml.load(fs.readFileSync(this.consentLogPath, 'utf8')) || { entries: [] };
      }
    } catch (error) {
      console.warn('Could not load consent log:', error.message);
    }

    return {
      metadata: {
        created: new Date().toISOString(),
        version: "1.0",
        description: "Consent decisions audit trail"
      },
      entries: []
    };
  }

  saveConsentLog() {
    try {
      this.consentLog.metadata.last_updated = new Date().toISOString();
      this.consentLog.metadata.total_entries = this.consentLog.entries.length;
      
      fs.writeFileSync(this.consentLogPath, yaml.dump(this.consentLog, { indent: 2 }));
    } catch (error) {
      console.error('Failed to save consent log:', error.message);
    }
  }

  /**
   * Request consent for external search operations
   * @param {string} searchType - Type of search (github, documentation, community)
   * @param {string} query - The search query
   * @param {Object} context - Additional context about the search
   * @returns {Promise<Object>} Consent result
   */
  async requestConsent(searchType, query, context = {}) {
    const securityConfig = this.config.security?.consent || {};
    const testConfig = this.config.development?.testing || {};
    
    // Check test mode - auto-grant consent if enabled
    if (this.config.development?.test_mode && testConfig.auto_grant_consent) {
      console.log(`🧪 Test mode: Auto-granting consent for ${searchType} search`);
      return { 
        granted: true, 
        reason: 'test_mode_auto_consent', 
        cached: false,
        test_mode: true 
      };
    }
    
    // Check if this search type requires consent
    if (!this.requiresConsent(searchType)) {
      return { granted: true, reason: 'no_consent_required', cached: false };
    }

    // Check for cached consent
    const cacheKey = this.generateConsentCacheKey(searchType, query, context);
    const cachedConsent = this.getCachedConsent(cacheKey);
    
    if (cachedConsent) {
      return { granted: true, reason: 'cached_consent', cached: true, expires: cachedConsent.expires };
    }

    // Interactive consent request (or skip if in test mode)
    if (this.config.development?.test_mode && testConfig.skip_interactive_prompts) {
      console.log(`🧪 Test mode: Skipping interactive prompt for ${searchType} search`);
      return { 
        granted: false, 
        reason: 'test_mode_skip_interactive', 
        cached: false,
        test_mode: true 
      };
    }
    
    const consentResult = await this.interactiveConsentRequest(searchType, query, context);
    
    // Log the consent decision
    this.logConsentDecision(searchType, query, consentResult, context);
    
    // Cache positive consent if configured
    if (consentResult.granted && securityConfig.consent_timeout_minutes) {
      this.cacheConsent(cacheKey, consentResult, securityConfig.consent_timeout_minutes);
    }

    return consentResult;
  }

  /**
   * Determine if a search type requires explicit consent
   * @param {string} searchType - Type of search
   * @returns {boolean} Whether consent is required
   */
  requiresConsent(searchType) {
    const consentConfig = this.config.security?.consent || {};
    
    switch (searchType) {
      case 'github':
        return this.config.github?.enabled && consentConfig.require_github_consent !== false;
      case 'documentation':
        return this.config.documentation?.require_explicit_consent !== false;
      case 'community':
        return true; // Always require consent for community sources
      default:
        return true; // Default to requiring consent for unknown types
    }
  }

  /**
   * Interactive consent request with enhanced safety measures
   * @param {string} searchType - Type of search
   * @param {string} query - The search query
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Consent result
   */
  async interactiveConsentRequest(searchType, query, context) {
    const securityConfig = this.config.security?.consent || {};
    
    // Show consent prompt with full disclosure
    console.log('\n🔒 EXTERNAL SEARCH CONSENT REQUEST');
    console.log('=====================================');
    console.log(`Search Type: ${searchType.toUpperCase()}`);
    console.log(`Query: "${query}"`);
    
    if (context.confidence !== undefined) {
      console.log(`Current Memory Confidence: ${Math.round(context.confidence * 100)}%`);
    }
    
    console.log('\n📋 What this means:');
    this.explainSearchImplications(searchType);
    
    console.log('\n⚠️  Privacy Notice:');
    console.log('- Your search query will be sent to external services');
    console.log('- Results may be cached locally for performance');
    console.log('- No personal data is included in search queries');
    
    // Enhanced consent mechanism
    if (securityConfig.require_typed_confirmation) {
      return await this.typedConfirmationConsent(searchType);
    } else {
      return await this.simpleConfirmationConsent(searchType);
    }
  }

  /**
   * Require typed confirmation for high-security environments
   * @param {string} searchType - Type of search
   * @returns {Promise<Object>} Consent result
   */
  async typedConfirmationConsent(searchType) {
    const confirmationPhrase = this.getConfirmationPhrase(searchType);
    
    console.log(`\n✋ To proceed, please type exactly: ${confirmationPhrase}`);
    console.log('   (or "cancel" to abort)');
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question('\nYour input: ', (answer) => {
        rl.close();
        
        const trimmedAnswer = answer.trim();
        const startTime = Date.now();
        
        if (trimmedAnswer === confirmationPhrase) {
          const consentHash = this.generateConsentHash(searchType, trimmedAnswer, startTime);
          resolve({
            granted: true,
            method: 'typed_confirmation',
            confirmation_phrase: confirmationPhrase,
            consent_hash: consentHash,
            timestamp: new Date().toISOString()
          });
        } else if (trimmedAnswer.toLowerCase() === 'cancel') {
          resolve({
            granted: false,
            method: 'typed_confirmation',
            reason: 'user_cancelled',
            timestamp: new Date().toISOString()
          });
        } else {
          console.log('❌ Incorrect confirmation phrase. Search cancelled for security.');
          resolve({
            granted: false,
            method: 'typed_confirmation',
            reason: 'incorrect_phrase',
            timestamp: new Date().toISOString()
          });
        }
      });
    });
  }

  /**
   * Simple yes/no confirmation
   * @param {string} searchType - Type of search
   * @returns {Promise<Object>} Consent result
   */
  async simpleConfirmationConsent(searchType) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question('\nProceed with external search? (y/N): ', (answer) => {
        rl.close();
        
        const isGranted = ['y', 'yes', 'Y', 'YES'].includes(answer.trim());
        
        resolve({
          granted: isGranted,
          method: 'simple_confirmation',
          user_input: answer.trim(),
          timestamp: new Date().toISOString()
        });
      });
    });
  }

  /**
   * Get appropriate confirmation phrase for search type
   * @param {string} searchType - Type of search
   * @returns {string} Confirmation phrase
   */
  getConfirmationPhrase(searchType) {
    const phrases = {
      github: 'search-github',
      documentation: 'search-docs',
      community: 'search-community'
    };
    
    return phrases[searchType] || 'search-external';
  }

  /**
   * Explain implications of the search type
   * @param {string} searchType - Type of search
   */
  explainSearchImplications(searchType) {
    switch (searchType) {
      case 'github':
        console.log('- Will search GitHub repositories for code examples');
        console.log('- Limited to trusted repositories and organizations');
        console.log('- Results are filtered by trust scoring system');
        console.log('- API calls are rate-limited and monitored');
        break;
        
      case 'documentation':
        console.log('- Will search official documentation sources');
        console.log('- Limited to pre-configured trusted documentation sites');
        console.log('- Results are cached to minimize external requests');
        console.log('- Only searches MDN, Node.js docs, and framework docs');
        break;
        
      case 'community':
        console.log('- Will search community sources like Stack Overflow');
        console.log('- Results have lower trust scores than official sources');
        console.log('- May include unverified or outdated information');
        console.log('- Requires additional scrutiny of results');
        break;
        
      default:
        console.log('- Will search external sources for additional context');
        console.log('- Results will be combined with memory-based solutions');
        console.log('- External data is treated with appropriate trust levels');
    }
  }

  /**
   * Generate consent cache key
   * @param {string} searchType - Type of search
   * @param {string} query - Search query
   * @param {Object} context - Additional context
   * @returns {string} Cache key
   */
  generateConsentCacheKey(searchType, query, context) {
    const keyData = `${searchType}:${query}:${context.category || 'unknown'}`;
    return crypto.createHash('sha256').update(keyData).digest('hex').substring(0, 16);
  }

  /**
   * Get cached consent if valid
   * @param {string} cacheKey - Cache key
   * @returns {Object|null} Cached consent or null
   */
  getCachedConsent(cacheKey) {
    const cached = this.consentCache.get(cacheKey);
    
    if (cached && Date.now() < cached.expires) {
      return cached;
    }
    
    // Remove expired consent
    if (cached) {
      this.consentCache.delete(cacheKey);
    }
    
    return null;
  }

  /**
   * Cache consent decision
   * @param {string} cacheKey - Cache key
   * @param {Object} consentResult - Consent result
   * @param {number} timeoutMinutes - Cache timeout in minutes
   */
  cacheConsent(cacheKey, consentResult, timeoutMinutes) {
    const expires = Date.now() + (timeoutMinutes * 60 * 1000);
    
    this.consentCache.set(cacheKey, {
      ...consentResult,
      cached_at: Date.now(),
      expires: expires
    });
  }

  /**
   * Generate consent hash for audit trail
   * @param {string} searchType - Type of search
   * @param {string} confirmation - Confirmation input
   * @param {number} timestamp - Timestamp
   * @returns {string} Consent hash
   */
  generateConsentHash(searchType, confirmation, timestamp) {
    const hashInput = `${searchType}:${confirmation}:${timestamp}`;
    return crypto.createHash('sha256').update(hashInput).digest('hex').substring(0, 32);
  }

  /**
   * Log consent decision for audit purposes
   * @param {string} searchType - Type of search
   * @param {string} query - Search query
   * @param {Object} consentResult - Consent result
   * @param {Object} context - Additional context
   */
  logConsentDecision(searchType, query, consentResult, context) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      search_type: searchType,
      query_hash: crypto.createHash('sha256').update(query).digest('hex').substring(0, 16),
      granted: consentResult.granted,
      method: consentResult.method,
      reason: consentResult.reason || 'user_decision',
      consent_hash: consentResult.consent_hash || null,
      context: {
        confidence: context.confidence,
        category: context.category,
        source_count: context.sourceCount
      },
      session_id: this.getSessionId()
    };

    this.consentLog.entries.push(logEntry);
    
    // Keep only recent entries to prevent unbounded growth
    const maxEntries = this.config.security?.consent?.audit_retention_entries || 10000;
    if (this.consentLog.entries.length > maxEntries) {
      this.consentLog.entries = this.consentLog.entries.slice(-maxEntries);
    }

    this.saveConsentLog();
  }

  /**
   * Check if user has bulk consent for the current session
   * @param {string} searchType - Type of search
   * @returns {boolean} Whether bulk consent exists
   */
  hasBulkConsent(searchType) {
    const sessionConsent = this.sessionConsent.get(searchType);
    return sessionConsent && sessionConsent.expires > Date.now();
  }

  /**
   * Grant bulk consent for the current session
   * @param {string} searchType - Type of search
   * @param {number} durationMinutes - Duration in minutes
   */
  grantBulkConsent(searchType, durationMinutes = 60) {
    const expires = Date.now() + (durationMinutes * 60 * 1000);
    
    this.sessionConsent.set(searchType, {
      granted_at: Date.now(),
      expires: expires
    });

    console.log(`✅ Bulk consent granted for ${searchType} searches (expires in ${durationMinutes} minutes)`);
  }

  /**
   * Programmatically grant consent for testing purposes
   * @param {string} searchType - Type of search  
   * @param {string} reason - Reason for granting consent
   * @returns {Object} Consent result
   */
  grantConsentForTesting(searchType, reason = 'testing') {
    if (!this.config.development?.test_mode) {
      throw new Error('Programmatic consent can only be granted in test mode');
    }

    console.log(`🧪 Test mode: Programmatically granting consent for ${searchType} (reason: ${reason})`);
    
    return {
      granted: true,
      reason: `test_programmatic_${reason}`,
      cached: false,
      test_mode: true,
      granted_at: new Date().toISOString()
    };
  }

  /**
   * Revoke all consent for security
   */
  revokeAllConsent() {
    this.consentCache.clear();
    this.sessionConsent.clear();
    
    console.log('🔒 All consent has been revoked for security');
  }

  /**
   * Get consent statistics for monitoring
   * @returns {Object} Consent statistics
   */
  getConsentStats() {
    const entries = this.consentLog.entries;
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const oneDayAgo = now - (24 * 60 * 60 * 1000);

    const recentEntries = entries.filter(entry => 
      new Date(entry.timestamp).getTime() > oneHourAgo
    );

    const dailyEntries = entries.filter(entry =>
      new Date(entry.timestamp).getTime() > oneDayAgo
    );

    const grantedCount = recentEntries.filter(entry => entry.granted).length;
    const deniedCount = recentEntries.filter(entry => !entry.granted).length;

    const searchTypeBreakdown = {};
    recentEntries.forEach(entry => {
      if (!searchTypeBreakdown[entry.search_type]) {
        searchTypeBreakdown[entry.search_type] = { granted: 0, denied: 0 };
      }
      if (entry.granted) {
        searchTypeBreakdown[entry.search_type].granted++;
      } else {
        searchTypeBreakdown[entry.search_type].denied++;
      }
    });

    return {
      total_requests_last_hour: recentEntries.length,
      total_requests_last_24h: dailyEntries.length,
      granted_last_hour: grantedCount,
      denied_last_hour: deniedCount,
      grant_rate: recentEntries.length > 0 ? grantedCount / recentEntries.length : 0,
      search_type_breakdown: searchTypeBreakdown,
      active_cache_entries: this.consentCache.size,
      active_session_consent: this.sessionConsent.size
    };
  }

  /**
   * Export consent audit log
   * @param {string} format - Export format (json, csv, yaml)
   * @returns {string} Formatted audit data
   */
  exportConsentAudit(format = 'json') {
    switch (format.toLowerCase()) {
      case 'csv':
        return this.exportAsCSV();
      case 'yaml':
        return yaml.dump(this.consentLog);
      case 'json':
      default:
        return JSON.stringify(this.consentLog, null, 2);
    }
  }

  exportAsCSV() {
    const headers = 'timestamp,search_type,granted,method,reason,session_id\n';
    const rows = this.consentLog.entries.map(entry => 
      `${entry.timestamp},${entry.search_type},${entry.granted},${entry.method},${entry.reason || ''},${entry.session_id}`
    ).join('\n');
    
    return headers + rows;
  }

  /**
   * Get or create session ID
   * @returns {string} Session ID
   */
  getSessionId() {
    if (!this.sessionId) {
      this.sessionId = crypto.randomBytes(8).toString('hex');
    }
    return this.sessionId;
  }

  getDefaultConfig() {
    return {
      security: {
        consent: {
          require_typed_confirmation: true,
          consent_timeout_minutes: 60,
          audit_retention_entries: 10000,
          require_github_consent: true
        }
      },
      github: {
        enabled: true
      },
      documentation: {
        require_explicit_consent: true
      }
    };
  }
}

module.exports = ConsentManager;