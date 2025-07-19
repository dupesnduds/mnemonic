/**
 * Security Service - Centralized security and authentication
 */

const crypto = require('crypto');
// Import security auth if available
try {
  var SecurityManager = require('../../security/auth');
} catch(e) {
  var SecurityManager = null;
}

class SecurityService {
  constructor(configurationManager) {
    this.config = configurationManager;
    this.securityManager = new SecurityManager({
      enableAuth: this.config.get('security.enableAuth', true),
      apiKeys: this.config.get('security.apiKeys', []),
      maxRequestsPerMinute: this.config.get('security.rateLimiting.maxRequestsPerMinute', 100)
    });
    
    this.sessions = new Map();
    this.blacklistedTokens = new Set();
    this.securityEvents = [];
    this.maxSecurityEvents = 1000;
  }

  // Main security middleware
  getSecurityMiddleware() {
    return (req, res, next) => {
      // Security headers
      res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
        'Referrer-Policy': 'strict-origin-when-cross-origin'
      });

      // CORS handling
      const corsConfig = this.config.get('security.cors', {});
      if (corsConfig.enabled) {
        res.set('Access-Control-Allow-Origin', corsConfig.origins.join(', '));
        res.set('Access-Control-Allow-Methods', corsConfig.methods.join(', '));
        res.set('Access-Control-Allow-Headers', corsConfig.headers.join(', '));
      }

      // Rate limiting
      if (this.config.get('security.rateLimiting.enabled', true)) {
        const rateLimitResult = this.securityManager.rateLimit(req, res, () => {});
        if (rateLimitResult === false) {
          return; // Rate limit exceeded, response already sent
        }
      }

      // Input sanitization
      this.sanitizeRequest(req);

      // Log security event
      this.logSecurityEvent('request', {
        ip: req.ip,
        userAgent: req.get('user-agent'),
        path: req.path,
        method: req.method,
        correlationId: req.correlationId
      });

      next();
    };
  }

  // Authentication middleware
  requireAuthentication() {
    return (req, res, next) => {
      if (!this.config.get('security.enableAuth', true)) {
        return next();
      }

      // Only accept API keys from headers, not query parameters for security
      const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
      
      if (!apiKey) {
        this.logSecurityEvent('authentication_failure', {
          reason: 'missing_api_key',
          ip: req.ip,
          path: req.path,
          correlationId: req.correlationId
        });
        
        return res.status(401).json({
          error: 'Authentication required',
          message: 'API key required in X-API-Key header or apiKey query parameter',
          correlationId: req.correlationId
        });
      }

      if (this.blacklistedTokens.has(apiKey)) {
        this.logSecurityEvent('authentication_failure', {
          reason: 'blacklisted_token',
          ip: req.ip,
          path: req.path,
          correlationId: req.correlationId
        });
        
        return res.status(401).json({
          error: 'Authentication failed',
          message: 'API key is blacklisted',
          correlationId: req.correlationId
        });
      }

      const validApiKeys = this.config.get('security.apiKeys', []);
      if (!validApiKeys.includes(apiKey)) {
        this.logSecurityEvent('authentication_failure', {
          reason: 'invalid_api_key',
          ip: req.ip,
          path: req.path,
          correlationId: req.correlationId
        });
        
        return res.status(401).json({
          error: 'Authentication failed',
          message: 'Invalid API key',
          correlationId: req.correlationId
        });
      }

      // Store authenticated user info
      req.user = {
        apiKey: apiKey,
        authenticated: true,
        authenticatedAt: new Date()
      };

      this.logSecurityEvent('authentication_success', {
        ip: req.ip,
        path: req.path,
        correlationId: req.correlationId
      });

      next();
    };
  }

  // Authorization middleware
  requirePermission(permission) {
    return (req, res, next) => {
      if (!req.user || !req.user.authenticated) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'User must be authenticated to access this resource',
          correlationId: req.correlationId
        });
      }

      // Check user permissions based on role and resource
      const hasPermission = this.checkUserPermission(req.user, permission, req);

      if (!hasPermission) {
        this.logSecurityEvent('authorization_failure', {
          reason: 'insufficient_permissions',
          permission: permission,
          ip: req.ip,
          path: req.path,
          correlationId: req.correlationId
        });
        
        return res.status(403).json({
          error: 'Access denied',
          message: `Permission '${permission}' is required`,
          correlationId: req.correlationId
        });
      }

      next();
    };
  }

  // Input sanitization
  sanitizeRequest(req) {
    // Sanitize query parameters
    if (req.query) {
      for (const [key, value] of Object.entries(req.query)) {
        if (typeof value === 'string') {
          req.query[key] = this.sanitizeString(value);
        }
      }
    }

    // Sanitize request body
    if (req.body && typeof req.body === 'object') {
      this.sanitizeObject(req.body);
    }
  }

  // Enhanced input validation and sanitization
  validateAndSanitizeInput(input, type = 'string', options = {}) {
    if (input === null || input === undefined) {
      return options.required ? { valid: false, error: 'Required field is missing' } : { valid: true, value: null };
    }

    switch (type) {
      case 'string':
        return this.validateString(input, options);
      case 'email':
        return this.validateEmail(input, options);
      case 'integer':
        return this.validateInteger(input, options);
      case 'boolean':
        return this.validateBoolean(input, options);
      case 'array':
        return this.validateArray(input, options);
      case 'object':
        return this.validateObject(input, options);
      default:
        return { valid: false, error: 'Unknown validation type' };
    }
  }

  validateString(str, options = {}) {
    if (typeof str !== 'string') {
      return { valid: false, error: 'Must be a string' };
    }

    const { minLength = 0, maxLength = 10000, pattern, allowHtml = false } = options;

    if (str.length < minLength) {
      return { valid: false, error: `Minimum length is ${minLength}` };
    }

    if (str.length > maxLength) {
      return { valid: false, error: `Maximum length is ${maxLength}` };
    }

    if (pattern && !pattern.test(str)) {
      return { valid: false, error: 'Invalid format' };
    }

    const sanitized = allowHtml ? this.sanitizeHtml(str) : this.sanitizeString(str);
    return { valid: true, value: sanitized };
  }

  validateEmail(email, options = {}) {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      return { valid: false, error: 'Invalid email format' };
    }
    return { valid: true, value: email.toLowerCase().trim() };
  }

  validateInteger(num, options = {}) {
    const parsed = parseInt(num);
    if (isNaN(parsed)) {
      return { valid: false, error: 'Must be an integer' };
    }

    const { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = options;
    if (parsed < min || parsed > max) {
      return { valid: false, error: `Must be between ${min} and ${max}` };
    }

    return { valid: true, value: parsed };
  }

  validateBoolean(bool, options = {}) {
    if (typeof bool === 'boolean') {
      return { valid: true, value: bool };
    }
    if (bool === 'true' || bool === '1') {
      return { valid: true, value: true };
    }
    if (bool === 'false' || bool === '0') {
      return { valid: true, value: false };
    }
    return { valid: false, error: 'Must be a boolean' };
  }

  validateArray(arr, options = {}) {
    if (!Array.isArray(arr)) {
      return { valid: false, error: 'Must be an array' };
    }

    const { maxItems = 1000, itemType = 'string' } = options;
    if (arr.length > maxItems) {
      return { valid: false, error: `Maximum ${maxItems} items allowed` };
    }

    const sanitized = [];
    for (const item of arr) {
      const result = this.validateAndSanitizeInput(item, itemType, options.itemOptions);
      if (!result.valid) {
        return { valid: false, error: `Array item invalid: ${result.error}` };
      }
      sanitized.push(result.value);
    }

    return { valid: true, value: sanitized };
  }

  validateObject(obj, options = {}) {
    if (typeof obj !== 'object' || obj === null) {
      return { valid: false, error: 'Must be an object' };
    }

    const { schema } = options;
    if (!schema) {
      return { valid: true, value: obj };
    }

    const sanitized = {};
    for (const [key, rules] of Object.entries(schema)) {
      const result = this.validateAndSanitizeInput(obj[key], rules.type, rules);
      if (!result.valid) {
        return { valid: false, error: `Field '${key}': ${result.error}` };
      }
      if (result.value !== null) {
        sanitized[key] = result.value;
      }
    }

    return { valid: true, value: sanitized };
  }

  sanitizeString(str) {
    if (typeof str !== 'string') return '';
    
    return str
      .replace(/[<>'"]/g, '') // Remove potentially dangerous characters
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, '') // Remove event handlers
      .replace(/data:/gi, '') // Remove data: URLs
      .replace(/vbscript:/gi, '') // Remove vbscript: protocol
      .replace(/\0/g, '') // Remove null bytes
      .trim()
      .substring(0, 10000); // Limit length
  }

  sanitizeHtml(str) {
    // Basic HTML sanitization - in production, use a library like DOMPurify
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+=/gi, '');
  }

  sanitizeObject(obj) {
    if (typeof obj !== 'object' || obj === null) return obj;
    
    const sanitized = Array.isArray(obj) ? [] : {};
    
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeString(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  // Token management
  generateApiKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  revokeApiKey(apiKey) {
    this.blacklistedTokens.add(apiKey);
    this.logSecurityEvent('api_key_revoked', {
      apiKey: apiKey.substring(0, 8) + '...' // Log only first 8 characters
    });
  }

  // Enhanced session management
  createSession(userId, options = {}) {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const ttl = this.getSessionTtl(options.userRole);
    const expiresAt = new Date(Date.now() + ttl);
    
    const session = {
      id: sessionId,
      userId: userId,
      role: options.userRole || 'user',
      createdAt: new Date(),
      lastActivity: new Date(),
      expiresAt: expiresAt,
      metadata: this.sanitizeObject(options.metadata || {}),
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      refreshToken: crypto.randomBytes(32).toString('hex')
    };

    this.sessions.set(sessionId, session);
    
    this.logSecurityEvent('session_created', {
      sessionId: sessionId,
      userId: userId,
      role: session.role,
      expiresAt: expiresAt,
      ipAddress: session.ipAddress
    });

    return sessionId;
  }

  getSessionTtl(userRole) {
    const ttlConfig = {
      'admin': 2 * 60 * 60 * 1000, // 2 hours
      'user': 8 * 60 * 60 * 1000,  // 8 hours
      'readonly': 24 * 60 * 60 * 1000, // 24 hours
      'service': 1 * 60 * 60 * 1000  // 1 hour
    };
    
    return ttlConfig[userRole] || ttlConfig['user'];
  }

  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    
    // Check if session exists and is not expired
    if (session && session.expiresAt && new Date() > session.expiresAt) {
      this.destroySession(sessionId);
      return null;
    }
    
    return session;
  }

  updateSessionActivity(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session && session.expiresAt && new Date() <= session.expiresAt) {
      session.lastActivity = new Date();
      
      // Extend session if it's about to expire (within 30 minutes)
      const timeUntilExpiry = session.expiresAt.getTime() - Date.now();
      if (timeUntilExpiry < 30 * 60 * 1000) { // 30 minutes
        const newTtl = this.getSessionTtl(session.role);
        session.expiresAt = new Date(Date.now() + newTtl);
        
        this.logSecurityEvent('session_extended', {
          sessionId: sessionId,
          userId: session.userId,
          newExpiresAt: session.expiresAt
        });
      }
    }
  }

  destroySession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.delete(sessionId);
      this.logSecurityEvent('session_destroyed', {
        sessionId: sessionId,
        userId: session.userId
      });
    }
  }

  // Permission checking system
  checkUserPermission(user, permission, req) {
    if (!user || !user.role) {
      return false;
    }

    // Define role-based permissions
    const permissions = {
      'admin': ['*'], // Admin has all permissions
      'user': ['memory:read', 'memory:write', 'retrieval:read'],
      'readonly': ['memory:read', 'retrieval:read'],
      'service': ['memory:read', 'memory:write', 'retrieval:read', 'retrieval:write']
    };

    const userPermissions = permissions[user.role] || [];
    
    // Check wildcard permission
    if (userPermissions.includes('*')) {
      return true;
    }

    // Check exact permission match
    if (userPermissions.includes(permission)) {
      return true;
    }

    // Check resource ownership for user-level permissions
    if (user.role === 'user' && permission.startsWith('memory:')) {
      return this.checkResourceOwnership(user, req);
    }

    return false;
  }

  checkResourceOwnership(user, req) {
    // For memory operations, users can only access their own data
    const resourceUserId = req.params.userId || req.body.userId || req.query.userId;
    return !resourceUserId || resourceUserId === user.id;
  }

  // Security event logging
  logSecurityEvent(eventType, eventData) {
    const event = {
      type: eventType,
      data: eventData,
      timestamp: new Date(),
      id: crypto.randomBytes(16).toString('hex')
    };

    this.securityEvents.push(event);

    // Keep only recent events
    if (this.securityEvents.length > this.maxSecurityEvents) {
      this.securityEvents.shift();
    }

    // Log to console
    console.log(`[SecurityService] ${eventType}:`, eventData);
  }

  getSecurityEvents(limit = 100) {
    return this.securityEvents.slice(-limit);
  }

  getSecurityEventsByType(eventType, limit = 100) {
    return this.securityEvents
      .filter(event => event.type === eventType)
      .slice(-limit);
  }

  // Security analytics
  getSecurityAnalytics() {
    const analytics = {
      totalEvents: this.securityEvents.length,
      eventTypes: {},
      recentEvents: this.getSecurityEvents(10),
      activeSessions: this.sessions.size,
      blacklistedTokens: this.blacklistedTokens.size
    };

    // Count events by type
    this.securityEvents.forEach(event => {
      analytics.eventTypes[event.type] = (analytics.eventTypes[event.type] || 0) + 1;
    });

    return analytics;
  }

  // Threat detection
  detectSuspiciousActivity(req) {
    const suspiciousPatterns = [
      /\.\.\//g, // Path traversal
      /<script/gi, // XSS
      /union.*select/gi, // SQL injection
      /javascript:/gi, // JavaScript injection
      /eval\(/gi, // Code injection
    ];

    const requestContent = JSON.stringify({
      path: req.path,
      query: req.query,
      body: req.body,
      headers: req.headers
    });

    const threats = [];
    
    suspiciousPatterns.forEach((pattern, index) => {
      if (pattern.test(requestContent)) {
        threats.push({
          type: ['path_traversal', 'xss', 'sql_injection', 'javascript_injection', 'code_injection'][index],
          pattern: pattern.toString(),
          detected: true
        });
      }
    });

    if (threats.length > 0) {
      this.logSecurityEvent('threat_detected', {
        threats: threats,
        ip: req.ip,
        path: req.path,
        correlationId: req.correlationId
      });
    }

    return threats;
  }

  // Health check
  async healthCheck() {
    const analytics = this.getSecurityAnalytics();
    const recentThreats = this.getSecurityEventsByType('threat_detected', 10);
    
    return {
      status: 'healthy',
      message: 'Security service is operational',
      metrics: {
        totalSecurityEvents: analytics.totalEvents,
        activeSessions: analytics.activeSessions,
        blacklistedTokens: analytics.blacklistedTokens,
        recentThreats: recentThreats.length,
        authenticationEnabled: this.config.get('security.enableAuth', true)
      },
      timestamp: new Date().toISOString()
    };
  }

  // Cleanup
  cleanup() {
    // Remove expired sessions
    const now = new Date();
    const sessionTimeout = 24 * 60 * 60 * 1000; // 24 hours
    
    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActivity > sessionTimeout) {
        this.destroySession(sessionId);
      }
    }

    // Limit security events
    if (this.securityEvents.length > this.maxSecurityEvents) {
      this.securityEvents = this.securityEvents.slice(-this.maxSecurityEvents);
    }
  }
}

module.exports = SecurityService;