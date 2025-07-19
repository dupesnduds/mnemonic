/**
 * API v2 Router - Main router for the new DDD-based API
 */

const express = require('express');
const MemoryController = require('./MemoryController');
const RetrievalController = require('./RetrievalController');
const SecurityController = require('./SecurityController');

// Import available repositories and services  
try {
  var MemoryRepository = require('../../infrastructure/repositories/MemoryRepository');
} catch(e) { var MemoryRepository = null; }
try {
  var SearchRepository = require('../../infrastructure/repositories/SearchRepository'); 
} catch(e) { var SearchRepository = null; }
try {
  var SecurityRepository = require('../../infrastructure/repositories/SecurityRepository');
} catch(e) { var SecurityRepository = null; }
try {
  var EventBus = require('../../infrastructure/events/EventBus');
} catch(e) { var EventBus = null; }

class ApiV2Router {
  constructor() {
    this.router = express.Router();
    this.setupMiddleware();
    this.setupRepositories();
    this.setupControllers();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  setupMiddleware() {
    // Request logging middleware
    this.router.use((req, res, next) => {
      const start = Date.now();
      console.log(`[API v2] ${req.method} ${req.path} - Started`);
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[API v2] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
      });
      
      next();
    });

    // Request validation middleware
    this.router.use(express.json({ limit: '10mb' }));
    this.router.use(express.urlencoded({ extended: true }));

    // CORS middleware - restrictive for production
    this.router.use((req, res, next) => {
      // Allow specific origins in production, all origins only in development
      const allowedOrigins = process.env.NODE_ENV === 'production' 
        ? (process.env.ALLOWED_ORIGINS || 'https://yourdomain.com').split(',')
        : ['*'];
      
      const origin = req.headers.origin;
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', allowedOrigins.includes('*') ? '*' : origin);
      }
      
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Max-Age', '86400'); // 24 hours
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // API versioning header
    this.router.use((req, res, next) => {
      res.set('X-API-Version', '2.0');
      next();
    });
  }

  setupRepositories() {
    // Initialize repositories with proper dependencies
    this.memoryRepository = new MemoryRepository();
    this.searchRepository = new SearchRepository();
    this.securityRepository = new SecurityRepository();
    
    // Initialize event publisher
    this.eventPublisher = new EventPublisher();
  }

  setupControllers() {
    // Initialize controllers with their dependencies
    this.memoryController = new MemoryController(
      this.memoryRepository,
      this.eventPublisher
    );
    
    this.retrievalController = new RetrievalController(
      this.searchRepository,
      this.memoryRepository,
      this.eventPublisher
    );
    
    this.securityController = new SecurityController(
      this.securityRepository,
      this.eventPublisher
    );
  }

  setupRoutes() {
    // API root endpoint
    this.router.get('/', (req, res) => {
      res.json({
        message: 'Brains Memory System API v2',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        endpoints: {
          memory: '/api/v2/memory',
          retrieval: '/api/v2/retrieval',
          auth: '/api/v2/auth',
          governance: '/api/v2/governance'
        },
        documentation: '/api/v2/docs'
      });
    });

    // Health check endpoint
    this.router.get('/health', async (req, res) => {
      try {
        const health = await this.checkHealth();
        res.json(health);
      } catch (error) {
        res.status(503).json({
          status: 'unhealthy',
          message: 'System health check failed',
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Mount controllers
    this.router.use('/memory', this.memoryController.getRouter());
    this.router.use('/retrieval', this.retrievalController.getRouter());
    this.router.use('/auth', this.securityController.getAuthRouter());
    this.router.use('/governance', this.securityController.getGovernanceRouter());

    // API documentation endpoint
    this.router.get('/docs', (req, res) => {
      res.json(this.getApiDocumentation());
    });

    // OpenAPI specification endpoint
    this.router.get('/openapi.json', (req, res) => {
      res.json(this.getOpenApiSpec());
    });
  }

  setupErrorHandling() {
    // Global error handler
    this.router.use((error, req, res, next) => {
      console.error('[API v2] Error:', error);
      
      // Domain validation errors
      if (error.name === 'ValidationError') {
        return res.status(400).json({
          error: 'Validation failed',
          message: error.message,
          details: error.details || [],
          timestamp: new Date().toISOString()
        });
      }

      // Domain business logic errors
      if (error.name === 'BusinessLogicError') {
        return res.status(422).json({
          error: 'Business logic error',
          message: error.message,
          timestamp: new Date().toISOString()
        });
      }

      // Repository errors
      if (error.name === 'RepositoryError') {
        return res.status(500).json({
          error: 'Data access error',
          message: 'A data access error occurred',
          timestamp: new Date().toISOString()
        });
      }

      // Generic error handler
      res.status(500).json({
        error: 'Internal server error',
        message: 'An unexpected error occurred',
        timestamp: new Date().toISOString()
      });
    });

    // 404 handler
    this.router.use((req, res) => {
      res.status(404).json({
        error: 'Not found',
        message: `Endpoint ${req.method} ${req.path} not found`,
        timestamp: new Date().toISOString()
      });
    });
  }

  async checkHealth() {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      components: {}
    };

    try {
      // Check memory repository
      health.components.memory = await this.memoryRepository.healthCheck();
      
      // Check search repository
      health.components.search = await this.searchRepository.healthCheck();
      
      // Check security repository
      health.components.security = await this.securityRepository.healthCheck();
      
      // Check event publisher
      health.components.events = await this.eventPublisher.healthCheck();
      
      // Overall health status
      const unhealthyComponents = Object.values(health.components)
        .filter(component => component.status !== 'healthy');
      
      if (unhealthyComponents.length > 0) {
        health.status = 'degraded';
      }

    } catch (error) {
      health.status = 'unhealthy';
      health.error = error.message;
    }

    return health;
  }

  getApiDocumentation() {
    return {
      title: 'Brains Memory System API v2',
      version: '2.0.0',
      description: 'Domain-driven design based API for the Brains Memory System',
      baseUrl: '/api/v2',
      authentication: {
        type: 'API Key',
        header: 'X-API-Key',
        description: 'Provide your API key in the X-API-Key header'
      },
      endpoints: {
        memory: {
          description: 'Memory management operations',
          operations: [
            'POST /memory/entries - Create memory entry',
            'GET /memory/entries/:id - Get memory entry',
            'PUT /memory/entries/:id - Update memory entry',
            'DELETE /memory/entries/:id - Delete memory entry',
            'GET /memory/entries - List memory entries',
            'POST /memory/search - Search memory entries',
            'GET /memory/categories - List categories',
            'POST /memory/conflicts/resolve - Resolve conflicts'
          ]
        },
        retrieval: {
          description: 'Intelligent retrieval operations',
          operations: [
            'POST /retrieval/search - Layered search',
            'GET /retrieval/sessions/:id - Get search session',
            'POST /retrieval/confidence/calibrate - Calibrate confidence',
            'POST /retrieval/synthesis - Synthesize results'
          ]
        },
        auth: {
          description: 'Authentication and authorization',
          operations: [
            'POST /auth/tokens - Create API token',
            'GET /auth/tokens - List tokens',
            'DELETE /auth/tokens/:id - Revoke token'
          ]
        },
        governance: {
          description: 'Governance and compliance',
          operations: [
            'GET /governance/audit/logs - Get audit logs',
            'GET /governance/compliance - Get compliance status'
          ]
        }
      }
    };
  }

  getOpenApiSpec() {
    return {
      openapi: '3.0.0',
      info: {
        title: 'Brains Memory System API',
        version: '2.0.0',
        description: 'Domain-driven design based API for the Brains Memory System',
        contact: {
          name: 'Brains Memory System Team',
          url: 'https://github.com/brains-memory/brains-memory-system'
        }
      },
      servers: [
        {
          url: '/api/v2',
          description: 'API v2 Base URL'
        }
      ],
      security: [
        {
          ApiKeyAuth: []
        }
      ],
      components: {
        securitySchemes: {
          ApiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key'
          }
        }
      },
      paths: {
        '/health': {
          get: {
            summary: 'Health check',
            responses: {
              '200': {
                description: 'System health status'
              }
            }
          }
        }
        // Additional paths would be defined here
      }
    };
  }

  getRouter() {
    return this.router;
  }
}

module.exports = ApiV2Router;