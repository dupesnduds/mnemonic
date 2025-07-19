/**
 * API Server - Minimal Express wrapper for C++ domain engine
 * Focuses purely on HTTP API and tooling integration
 */

const express = require('express');
const CppDomainBridge = require('./CppDomainBridge');

class ApiServer {
  constructor(config = {}) {
    this.app = express();
    this.bridge = new CppDomainBridge();
    this.config = {
      port: 8081,
      enableCors: true,
      enableAuth: false,
      apiKeys: [],
      ...config
    };
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  setupMiddleware() {
    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // CORS
    if (this.config.enableCors) {
      this.app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key');
        
        if (req.method === 'OPTIONS') {
          return res.sendStatus(200);
        }
        next();
      });
    }

    // Request logging
    this.app.use((req, res, next) => {
      const start = Date.now();
      console.log(`[ApiServer] ${req.method} ${req.path} - Started`);
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[ApiServer] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
      });
      
      next();
    });

    // API key authentication
    if (this.config.enableAuth) {
      this.app.use('/api', this.authenticateApiKey.bind(this));
    }
  }

  authenticateApiKey(req, res, next) {
    // Skip auth for health endpoint
    if (req.path === '/health') {
      return next();
    }

    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    
    if (!apiKey) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'API key required in X-API-Key header or apiKey query parameter'
      });
    }

    if (!this.config.apiKeys.includes(apiKey)) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid API key'
      });
    }

    next();
  }

  setupRoutes() {
    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        message: 'Brains Memory System - C++ Domain Engine',
        version: '2.0.0',
        architecture: 'C++ Core + JS API',
        engineType: this.bridge.getEngineType(),
        endpoints: {
          health: '/health',
          memory: '/api/memory',
          search: '/api/search',
          statistics: '/api/statistics'
        }
      });
    });

    // Health check
    this.app.get('/health', (req, res) => {
      const health = this.bridge.healthCheck();
      const statusCode = health.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(health);
    });

    // Memory operations
    this.app.post('/api/memory/entries', this.createMemoryEntry.bind(this));
    this.app.get('/api/memory/entries/:id', this.getMemoryEntry.bind(this));
    this.app.put('/api/memory/entries/:id', this.updateMemoryEntry.bind(this));
    this.app.post('/api/memory/entries/bulk', this.createMemoryEntriesBulk.bind(this));

    // Search operations
    this.app.post('/api/search', this.searchMemories.bind(this));
    this.app.post('/api/search/multiple', this.searchMultiple.bind(this));

    // Categorization
    this.app.post('/api/categorize', this.categorizeError.bind(this));

    // Solution finding (legacy compatibility)
    this.app.post('/api/solution', this.findSolution.bind(this));

    // Statistics and monitoring
    this.app.get('/api/statistics', this.getStatistics.bind(this));

    // Legacy MCP compatibility endpoint
    this.app.post('/', this.legacyMcpEndpoint.bind(this));
  }

  // Route handlers
  async createMemoryEntry(req, res) {
    try {
      const { problem, solution, category } = req.body;

      if (!problem || !solution || !category) {
        return res.status(400).json({
          error: 'Validation failed',
          message: 'problem, solution, and category are required'
        });
      }

      const entryId = this.bridge.createMemoryEntry(problem, solution, category);
      
      if (!entryId) {
        return res.status(500).json({
          error: 'Creation failed',
          message: 'Failed to create memory entry'
        });
      }

      res.status(201).json({
        success: true,
        entryId,
        message: 'Memory entry created successfully'
      });

    } catch (error) {
      console.error('[ApiServer] Error creating memory entry:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  async getMemoryEntry(req, res) {
    try {
      const { id } = req.params;
      const entry = this.bridge.getMemoryEntry(id);
      
      if (!entry || Object.keys(entry).length === 0) {
        return res.status(404).json({
          error: 'Not found',
          message: `Memory entry with ID ${id} not found`
        });
      }

      res.json({
        success: true,
        data: entry
      });

    } catch (error) {
      console.error('[ApiServer] Error getting memory entry:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  async updateMemoryEntry(req, res) {
    try {
      const { id } = req.params;
      const { solution, reason } = req.body;

      if (!solution) {
        return res.status(400).json({
          error: 'Validation failed',
          message: 'solution is required'
        });
      }

      const success = this.bridge.updateMemoryEntry(id, solution, reason || 'Updated via API');
      
      if (!success) {
        return res.status(404).json({
          error: 'Update failed',
          message: `Memory entry with ID ${id} not found or update failed`
        });
      }

      res.json({
        success: true,
        message: 'Memory entry updated successfully'
      });

    } catch (error) {
      console.error('[ApiServer] Error updating memory entry:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  async createMemoryEntriesBulk(req, res) {
    try {
      const { entries } = req.body;

      if (!Array.isArray(entries)) {
        return res.status(400).json({
          error: 'Validation failed',
          message: 'entries must be an array'
        });
      }

      const results = this.bridge.createMemoryEntries(entries);
      
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;

      res.json({
        success: true,
        message: `Created ${successCount} entries, ${failureCount} failures`,
        results,
        summary: {
          total: results.length,
          successful: successCount,
          failed: failureCount
        }
      });

    } catch (error) {
      console.error('[ApiServer] Error creating bulk memory entries:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  async searchMemories(req, res) {
    try {
      const { query, category, maxResults } = req.body;

      if (!query) {
        return res.status(400).json({
          error: 'Validation failed',
          message: 'query is required'
        });
      }

      const results = this.bridge.searchMemories(query, {
        category,
        maxResults: maxResults || 10
      });

      res.json({
        success: true,
        query,
        results,
        count: Array.isArray(results) ? results.length : 0
      });

    } catch (error) {
      console.error('[ApiServer] Error searching memories:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  async searchMultiple(req, res) {
    try {
      const { queries } = req.body;

      if (!Array.isArray(queries)) {
        return res.status(400).json({
          error: 'Validation failed',
          message: 'queries must be an array'
        });
      }

      const results = this.bridge.searchMultiple(queries);

      res.json({
        success: true,
        results,
        queryCount: queries.length
      });

    } catch (error) {
      console.error('[ApiServer] Error in multiple search:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  async categorizeError(req, res) {
    try {
      const { error: errorMessage } = req.body;

      if (!errorMessage) {
        return res.status(400).json({
          error: 'Validation failed',
          message: 'error message is required'
        });
      }

      const category = this.bridge.categorizeError(errorMessage);

      res.json({
        success: true,
        error: errorMessage,
        category
      });

    } catch (error) {
      console.error('[ApiServer] Error categorizing error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  async findSolution(req, res) {
    try {
      const { problem, category } = req.body;

      if (!problem) {
        return res.status(400).json({
          error: 'Validation failed',
          message: 'problem is required'
        });
      }

      const solution = this.bridge.findSolution(problem, category);

      if (!solution) {
        return res.status(404).json({
          success: false,
          message: 'No solution found'
        });
      }

      res.json({
        success: true,
        problem,
        solution
      });

    } catch (error) {
      console.error('[ApiServer] Error finding solution:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  async getStatistics(req, res) {
    try {
      const stats = this.bridge.getStatistics();

      res.json({
        success: true,
        statistics: stats,
        engineType: this.bridge.getEngineType(),
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('[ApiServer] Error getting statistics:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  // Legacy MCP endpoint for backward compatibility
  async legacyMcpEndpoint(req, res) {
    try {
      const { problem } = req.body;

      if (!problem) {
        return res.status(400).json({
          error: 'problem is required'
        });
      }

      const solution = this.bridge.findSolution(problem);

      if (!solution) {
        return res.status(404).json({
          message: 'No solution found for the given problem'
        });
      }

      // Legacy response format
      res.json({
        category: solution.category || 'general',
        solution: solution.content || solution.solution || 'Solution found',
        source: solution.source || 'memory'
      });

    } catch (error) {
      console.error('[ApiServer] Error in legacy MCP endpoint:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }

  setupErrorHandling() {
    // Global error handler
    this.app.use((error, req, res, next) => {
      console.error('[ApiServer] Unhandled error:', error);
      
      res.status(500).json({
        error: 'Internal server error',
        message: 'An unexpected error occurred',
        timestamp: new Date().toISOString()
      });
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not found',
        message: `Endpoint ${req.method} ${req.path} not found`,
        timestamp: new Date().toISOString()
      });
    });
  }

  async initialize(categories = {}) {
    console.log('[ApiServer] Initializing C++ domain engine...');
    
    const success = await this.bridge.initialize(categories);
    
    if (success) {
      console.log('[ApiServer] C++ domain engine initialized successfully');
    } else {
      console.error('[ApiServer] Failed to initialize C++ domain engine');
      throw new Error('Failed to initialize C++ domain engine');
    }
    
    return success;
  }

  async start() {
    return new Promise((resolve, reject) => {
      const server = this.app.listen(this.config.port, (error) => {
        if (error) {
          reject(error);
        } else {
          console.log(`[ApiServer] Server started on port ${this.config.port}`);
          console.log(`[ApiServer] Engine type: ${this.bridge.getEngineType()}`);
          console.log(`[ApiServer] Health check: http://localhost:${this.config.port}/health`);
          console.log(`[ApiServer] API endpoints: http://localhost:${this.config.port}/api`);
          resolve(server);
        }
      });
    });
  }

  getApp() {
    return this.app;
  }

  getBridge() {
    return this.bridge;
  }
}

module.exports = ApiServer;