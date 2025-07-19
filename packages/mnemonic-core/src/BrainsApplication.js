/**
 * Brains Application - Main application class with DDD architecture
 */

const express = require('express');
const ApiV2Router = require('./presentation/api/v2/router');
const EventBus = require('./infrastructure/events/EventBus');
const ConfigurationManager = require('./infrastructure/configuration/ConfigurationManager');
const MonitoringService = require('./infrastructure/monitoring/MonitoringService');
const SecurityService = require('./infrastructure/security/SecurityService');

class BrainsApplication {
  constructor(config = {}) {
    this.app = express();
    this.config = config;
    this.isInitialized = false;
    this.services = {};
    this.eventBus = new EventBus();
    
    // Initialize core services
    this.initializeServices();
  }

  initializeServices() {
    // Configuration management
    this.services.configuration = new ConfigurationManager(this.config);
    
    // Monitoring and observability
    this.services.monitoring = new MonitoringService(this.eventBus);
    
    // Security service
    this.services.security = new SecurityService(this.services.configuration);
    
    console.log('[BrainsApplication] Core services initialized');
  }

  async initialize() {
    if (this.isInitialized) {
      console.log('[BrainsApplication] Already initialized, skipping...');
      return;
    }

    try {
      console.log('[BrainsApplication] Initializing application...');
      
      // Initialize services
      await this.initializeMiddleware();
      await this.initializeRoutes();
      await this.initializeErrorHandling();
      await this.initializeEventHandlers();
      
      this.isInitialized = true;
      console.log('[BrainsApplication] Application initialized successfully');
      
    } catch (error) {
      console.error('[BrainsApplication] Initialization failed:', error);
      throw error;
    }
  }

  async initializeMiddleware() {
    // Trust proxy for correct IP addresses
    this.app.set('trust proxy', 1);

    // Security middleware
    this.app.use(this.services.security.getSecurityMiddleware());

    // Monitoring middleware
    this.app.use(this.services.monitoring.getRequestMiddleware());

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request correlation ID
    this.app.use((req, res, next) => {
      req.correlationId = req.headers['x-correlation-id'] || 
                         `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      res.set('X-Correlation-ID', req.correlationId);
      next();
    });

    // Request logging
    this.app.use((req, res, next) => {
      const start = Date.now();
      console.log(`[${req.correlationId}] ${req.method} ${req.path} - Started`);
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${req.correlationId}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
      });
      
      next();
    });

    console.log('[BrainsApplication] Middleware initialized');
  }

  async initializeRoutes() {
    // Legacy API compatibility (existing endpoints)
    this.app.use('/api/v1', this.getLegacyRouter());

    // New DDD-based API v2
    const apiV2Router = new ApiV2Router();
    this.app.use('/api/v2', apiV2Router.getRouter());

    // Default route for backward compatibility
    this.app.use('/api', apiV2Router.getRouter());

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        message: 'Brains Memory System',
        version: '2.0.0',
        architecture: 'Domain-Driven Design',
        apis: {
          'v1': '/api/v1 (Legacy)',
          'v2': '/api/v2 (Current)'
        },
        health: '/health',
        metrics: '/metrics',
        documentation: '/api/v2/docs'
      });
    });

    // Global health endpoint
    this.app.get('/health', async (req, res) => {
      try {
        const health = await this.checkApplicationHealth();
        const statusCode = health.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(health);
      } catch (error) {
        res.status(503).json({
          status: 'unhealthy',
          message: 'Health check failed',
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    console.log('[BrainsApplication] Routes initialized');
  }

  async initializeErrorHandling() {
    // Global error handler
    this.app.use((error, req, res, next) => {
      console.error(`[${req.correlationId}] Unhandled error:`, error);
      
      // Emit error event for monitoring
      this.eventBus.emit('application.error', {
        correlationId: req.correlationId,
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
      });

      // Domain-specific error handling
      if (error.name === 'ValidationError') {
        return res.status(400).json({
          error: 'Validation failed',
          message: error.message,
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        });
      }

      if (error.name === 'BusinessLogicError') {
        return res.status(422).json({
          error: 'Business logic error',
          message: error.message,
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        });
      }

      if (error.name === 'AuthenticationError') {
        return res.status(401).json({
          error: 'Authentication required',
          message: error.message,
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        });
      }

      if (error.name === 'AuthorizationError') {
        return res.status(403).json({
          error: 'Access denied',
          message: error.message,
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        });
      }

      // Generic error response
      res.status(500).json({
        error: 'Internal server error',
        message: 'An unexpected error occurred',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not found',
        message: `Endpoint ${req.method} ${req.path} not found`,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });
    });

    console.log('[BrainsApplication] Error handling initialized');
  }

  async initializeEventHandlers() {
    // Application-level event handlers
    this.eventBus.on('application.started', (data) => {
      console.log('[BrainsApplication] Application started:', data);
    });

    this.eventBus.on('application.error', (data) => {
      console.error('[BrainsApplication] Application error:', data);
      // Send to monitoring service
      this.services.monitoring.recordError(data);
    });

    this.eventBus.on('memory.entry.created', (data) => {
      console.log('[BrainsApplication] Memory entry created:', data);
      this.services.monitoring.recordMemoryOperation('create', data);
    });

    this.eventBus.on('search.session.completed', (data) => {
      console.log('[BrainsApplication] Search session completed:', data);
      this.services.monitoring.recordSearchOperation(data);
    });

    console.log('[BrainsApplication] Event handlers initialized');
  }

  getLegacyRouter() {
    const router = express.Router();
    
    // Legacy API compatibility layer
    router.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        message: 'Legacy API v1 - Consider migrating to v2',
        timestamp: new Date().toISOString()
      });
    });

    router.all('*', (req, res) => {
      res.status(410).json({
        error: 'API v1 Deprecated',
        message: 'API v1 is deprecated. Please use API v2 at /api/v2',
        migration: '/api/v2/docs',
        timestamp: new Date().toISOString()
      });
    });

    return router;
  }

  async checkApplicationHealth() {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      architecture: 'Domain-Driven Design',
      components: {
        application: { status: 'healthy' },
        eventBus: { status: 'healthy' },
        services: {}
      }
    };

    try {
      // Check all services
      for (const [name, service] of Object.entries(this.services)) {
        if (service.healthCheck) {
          health.components.services[name] = await service.healthCheck();
        } else {
          health.components.services[name] = { status: 'healthy', message: 'No health check available' };
        }
      }

      // Check event bus
      health.components.eventBus = {
        status: 'healthy',
        listenersCount: this.eventBus.eventNames().length
      };

      // Determine overall health
      const unhealthyComponents = this.findUnhealthyComponents(health.components);
      if (unhealthyComponents.length > 0) {
        health.status = unhealthyComponents.length === 1 ? 'degraded' : 'unhealthy';
        health.unhealthyComponents = unhealthyComponents;
      }

    } catch (error) {
      health.status = 'unhealthy';
      health.error = error.message;
    }

    return health;
  }

  findUnhealthyComponents(components, path = '') {
    const unhealthy = [];
    
    for (const [key, value] of Object.entries(components)) {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (value.status && value.status !== 'healthy') {
        unhealthy.push({
          component: currentPath,
          status: value.status,
          message: value.message
        });
      }
      
      if (typeof value === 'object' && value !== null && !value.status) {
        unhealthy.push(...this.findUnhealthyComponents(value, currentPath));
      }
    }
    
    return unhealthy;
  }

  async start(port = 8081) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      const server = this.app.listen(port, (error) => {
        if (error) {
          reject(error);
        } else {
          console.log(`[BrainsApplication] Server started on port ${port}`);
          
          // Emit application started event
          this.eventBus.emit('application.started', {
            port,
            timestamp: new Date().toISOString(),
            version: '2.0.0'
          });
          
          resolve(server);
        }
      });
    });
  }

  getApp() {
    return this.app;
  }

  getEventBus() {
    return this.eventBus;
  }

  getServices() {
    return this.services;
  }
}

module.exports = BrainsApplication;