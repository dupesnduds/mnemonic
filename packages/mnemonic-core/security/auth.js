// security/auth.js - Authentication and authorization for observability endpoints

const crypto = require('crypto');

class SecurityManager {
  constructor(options = {}) {
    this.apiKeys = new Set(options.apiKeys || []);
    this.enableAuth = options.enableAuth !== false;
    this.rateLimiter = new Map();
    this.maxRequestsPerMinute = options.maxRequestsPerMinute || 60;
    
    // Load API keys from environment if available
    if (process.env.BRAINS_API_KEYS) {
      process.env.BRAINS_API_KEYS.split(',').forEach(key => {
        this.apiKeys.add(key.trim());
      });
    }
    
    // Generate default API key if none provided
    if (this.apiKeys.size === 0 && this.enableAuth) {
      const defaultKey = this.generateApiKey();
      this.apiKeys.add(defaultKey);
      console.log(`[SECURITY] Generated default API key: ${defaultKey}`);
      console.log('[SECURITY] Set BRAINS_API_KEYS environment variable in production');
    }
  }

  generateApiKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Middleware for API key authentication
  requireApiKey(req, res, next) {
    if (!this.enableAuth) {
      return next();
    }

    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    
    if (!apiKey) {
      return res.status(401).json({
        error: 'API key required',
        message: 'Provide API key in X-API-Key header or apiKey query parameter'
      });
    }

    if (!this.apiKeys.has(apiKey)) {
      return res.status(403).json({
        error: 'Invalid API key',
        message: 'The provided API key is not valid'
      });
    }

    // Store API key info for logging
    req.apiKey = apiKey.substring(0, 8) + '...';
    next();
  }

  // Rate limiting middleware
  rateLimit(req, res, next) {
    const clientId = req.headers['x-api-key'] || req.ip;
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute window

    if (!this.rateLimiter.has(clientId)) {
      this.rateLimiter.set(clientId, { requests: 0, windowStart: now });
    }

    const client = this.rateLimiter.get(clientId);

    // Reset window if expired
    if (now - client.windowStart > windowMs) {
      client.requests = 0;
      client.windowStart = now;
    }

    client.requests++;

    if (client.requests > this.maxRequestsPerMinute) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Maximum ${this.maxRequestsPerMinute} requests per minute allowed`,
        retryAfter: Math.ceil((windowMs - (now - client.windowStart)) / 1000)
      });
    }

    res.setHeader('X-RateLimit-Limit', this.maxRequestsPerMinute);
    res.setHeader('X-RateLimit-Remaining', this.maxRequestsPerMinute - client.requests);
    res.setHeader('X-RateLimit-Reset', new Date(client.windowStart + windowMs).toISOString());

    next();
  }

  // Sanitize sensitive data from logs and traces
  sanitizeData(data) {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    const sensitiveFields = [
      'password', 'token', 'key', 'secret', 'credential',
      'auth', 'session', 'cookie', 'api_key', 'apikey'
    ];

    const sanitized = Array.isArray(data) ? [] : {};

    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      
      if (sensitiveFields.some(field => lowerKey.includes(field))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeData(value);
      } else if (typeof value === 'string' && this.containsSensitiveData(value)) {
        sanitized[key] = this.redactSensitiveData(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  containsSensitiveData(str) {
    const patterns = [
      /\b[A-Za-z0-9]{32,}\b/, // Long hex strings (API keys)
      /Bearer\s+[A-Za-z0-9\-._~+/]+=*/i, // Bearer tokens
      /\b(?:password|pwd|secret|token|key)\s*[:=]\s*['"]?[^\s'"]+/i, // Key-value pairs
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email addresses
      /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/ // Credit card patterns
    ];

    return patterns.some(pattern => pattern.test(str));
  }

  redactSensitiveData(str) {
    return str
      .replace(/\b[A-Za-z0-9]{32,}\b/g, '[REDACTED-KEY]')
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
      .replace(/\b(?:password|pwd|secret|token|key)\s*[:=]\s*['"]?[^\s'"]+/gi, '$1[REDACTED]')
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[REDACTED-EMAIL]')
      .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[REDACTED-CARD]');
  }

  // Middleware to sanitize request/response data
  sanitizeMiddleware(req, res, next) {
    // Sanitize request body
    if (req.body) {
      req.sanitizedBody = this.sanitizeData(req.body);
    }

    // Intercept response JSON to sanitize
    const originalJson = res.json;
    res.json = function(data) {
      const sanitizedData = req.app.locals.securityManager.sanitizeData(data);
      return originalJson.call(this, sanitizedData);
    };

    next();
  }

  // Security headers middleware
  securityHeaders(req, res, next) {
    // Prevent information leakage
    res.setHeader('X-Powered-By', 'Brains-Memory');
    res.setHeader('Server', 'Brains-Memory/2.0');
    
    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // CSP for admin interfaces
    if (req.path.includes('/admin') || req.path.includes('/dashboard')) {
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'");
    }

    next();
  }

  // Audit logging
  auditLog(req, res, action, result = 'success') {
    const logEntry = {
      timestamp: new Date().toISOString(),
      action,
      result,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      apiKey: req.apiKey || 'anonymous',
      endpoint: req.originalUrl,
      method: req.method,
      statusCode: res.statusCode
    };

    // Log to security audit file
    const fs = require('fs');
    fs.appendFileSync('security-audit.log', JSON.stringify(logEntry) + '\n');
  }

  // Clean up old rate limit entries
  cleanup() {
    const now = Date.now();
    const windowMs = 60 * 1000;

    for (const [clientId, client] of this.rateLimiter.entries()) {
      if (now - client.windowStart > windowMs) {
        this.rateLimiter.delete(clientId);
      }
    }
  }
}

module.exports = SecurityManager;