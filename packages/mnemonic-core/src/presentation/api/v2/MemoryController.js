/**
 * Memory Controller v2 - RESTful API for memory management
 */

const express = require('express');
const MemoryEntry = require('../../../domain/memory-management/entities/MemoryEntry');
const Category = require('../../../domain/memory-management/value-objects/Category');
const Confidence = require('../../../domain/memory-management/value-objects/Confidence');
const ConflictResolver = require('../../../domain/memory-management/services/ConflictResolver');

class MemoryController {
  constructor(memoryRepository, eventPublisher) {
    this.memoryRepository = memoryRepository;
    this.eventPublisher = eventPublisher;
    this.conflictResolver = new ConflictResolver();
    this.router = express.Router();
    this.setupRoutes();
  }

  setupRoutes() {
    // Memory entry management
    this.router.post('/entries', this.createEntry.bind(this));
    this.router.get('/entries/:id', this.getEntry.bind(this));
    this.router.put('/entries/:id', this.updateEntry.bind(this));
    this.router.delete('/entries/:id', this.deleteEntry.bind(this));
    this.router.get('/entries', this.listEntries.bind(this));

    // Search and retrieval
    this.router.post('/search', this.searchMemory.bind(this));
    this.router.post('/search/advanced', this.advancedSearch.bind(this));

    // Category management
    this.router.get('/categories', this.listCategories.bind(this));
    this.router.post('/categories', this.createCategory.bind(this));

    // Conflict resolution
    this.router.post('/conflicts/resolve', this.resolveConflict.bind(this));
    this.router.get('/conflicts/history', this.getConflictHistory.bind(this));

    // Analytics
    this.router.get('/analytics/stats', this.getAnalytics.bind(this));
    this.router.get('/analytics/categories', this.getCategoryAnalytics.bind(this));
  }

  async createEntry(req, res) {
    try {
      const { problem, solution, category, metadata = {} } = req.body;

      // Validate required fields
      if (!problem || !solution || !category) {
        return res.status(400).json({
          error: 'Validation failed',
          message: 'Problem, solution, and category are required',
          details: {
            problem: !problem ? 'Problem is required' : null,
            solution: !solution ? 'Solution is required' : null,
            category: !category ? 'Category is required' : null
          }
        });
      }

      // Create category value object
      const categoryVO = Category.fromString(category);
      
      // Create memory entry
      const entry = MemoryEntry.create(problem, solution, categoryVO, metadata);
      
      // Validate entry
      const validationErrors = entry.validate();
      if (validationErrors.length > 0) {
        return res.status(400).json({
          error: 'Validation failed',
          message: 'Entry validation failed',
          details: validationErrors
        });
      }

      // Save to repository
      const savedEntry = await this.memoryRepository.save(entry);
      
      // Publish domain events
      await this.publishEvents(entry);

      res.status(201).json({
        success: true,
        data: savedEntry.toJSON(),
        message: 'Memory entry created successfully'
      });

    } catch (error) {
      console.error('Error creating memory entry:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to create memory entry',
        details: error.message
      });
    }
  }

  async getEntry(req, res) {
    try {
      const { id } = req.params;
      const entry = await this.memoryRepository.findById(id);
      
      if (!entry) {
        return res.status(404).json({
          error: 'Not found',
          message: `Memory entry with ID ${id} not found`
        });
      }

      res.json({
        success: true,
        data: entry.toJSON()
      });

    } catch (error) {
      console.error('Error retrieving memory entry:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve memory entry',
        details: error.message
      });
    }
  }

  async updateEntry(req, res) {
    try {
      const { id } = req.params;
      const { solution, reason } = req.body;

      if (!solution) {
        return res.status(400).json({
          error: 'Validation failed',
          message: 'Solution is required for update'
        });
      }

      const entry = await this.memoryRepository.findById(id);
      
      if (!entry) {
        return res.status(404).json({
          error: 'Not found',
          message: `Memory entry with ID ${id} not found`
        });
      }

      // Update entry
      entry.updateSolution(solution, reason);
      
      // Save updated entry
      const savedEntry = await this.memoryRepository.save(entry);
      
      // Publish domain events
      await this.publishEvents(entry);

      res.json({
        success: true,
        data: savedEntry.toJSON(),
        message: 'Memory entry updated successfully'
      });

    } catch (error) {
      console.error('Error updating memory entry:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to update memory entry',
        details: error.message
      });
    }
  }

  async deleteEntry(req, res) {
    try {
      const { id } = req.params;
      const deleted = await this.memoryRepository.delete(id);
      
      if (!deleted) {
        return res.status(404).json({
          error: 'Not found',
          message: `Memory entry with ID ${id} not found`
        });
      }

      res.json({
        success: true,
        message: 'Memory entry deleted successfully'
      });

    } catch (error) {
      console.error('Error deleting memory entry:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to delete memory entry',
        details: error.message
      });
    }
  }

  async listEntries(req, res) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        category, 
        confidence, 
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        category,
        confidence: confidence ? parseFloat(confidence) : undefined,
        sortBy,
        sortOrder
      };

      const result = await this.memoryRepository.findAll(options);
      
      res.json({
        success: true,
        data: result.entries.map(entry => entry.toJSON()),
        pagination: {
          page: options.page,
          limit: options.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / options.limit)
        }
      });

    } catch (error) {
      console.error('Error listing memory entries:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to list memory entries',
        details: error.message
      });
    }
  }

  async searchMemory(req, res) {
    try {
      const { query, category, confidence, limit = 10 } = req.body;

      if (!query) {
        return res.status(400).json({
          error: 'Validation failed',
          message: 'Query is required'
        });
      }

      const searchOptions = {
        query,
        category,
        confidence: confidence ? parseFloat(confidence) : undefined,
        limit: parseInt(limit)
      };

      const results = await this.memoryRepository.search(searchOptions);
      
      res.json({
        success: true,
        data: {
          query,
          results: results.map(entry => entry.toJSON()),
          metadata: {
            totalFound: results.length,
            searchOptions
          }
        }
      });

    } catch (error) {
      console.error('Error searching memory:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to search memory',
        details: error.message
      });
    }
  }

  async advancedSearch(req, res) {
    try {
      const { 
        query, 
        categories = [], 
        confidenceRange = {}, 
        dateRange = {},
        limit = 10,
        includeConflicts = false
      } = req.body;

      if (!query) {
        return res.status(400).json({
          error: 'Validation failed',
          message: 'Query is required'
        });
      }

      const searchOptions = {
        query,
        categories,
        confidenceRange,
        dateRange,
        limit: parseInt(limit),
        includeConflicts
      };

      const results = await this.memoryRepository.advancedSearch(searchOptions);
      
      res.json({
        success: true,
        data: {
          query,
          results: results.map(entry => entry.toJSON()),
          metadata: {
            totalFound: results.length,
            searchOptions
          }
        }
      });

    } catch (error) {
      console.error('Error performing advanced search:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to perform advanced search',
        details: error.message
      });
    }
  }

  async listCategories(req, res) {
    try {
      const categories = await this.memoryRepository.getCategories();
      
      res.json({
        success: true,
        data: categories.map(cat => cat.toJSON())
      });

    } catch (error) {
      console.error('Error listing categories:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to list categories',
        details: error.message
      });
    }
  }

  async createCategory(req, res) {
    try {
      const { name, description, patterns = [] } = req.body;

      if (!name || !description) {
        return res.status(400).json({
          error: 'Validation failed',
          message: 'Name and description are required'
        });
      }

      const category = Category.create(name, description, patterns);
      const savedCategory = await this.memoryRepository.saveCategory(category);
      
      res.status(201).json({
        success: true,
        data: savedCategory.toJSON(),
        message: 'Category created successfully'
      });

    } catch (error) {
      console.error('Error creating category:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to create category',
        details: error.message
      });
    }
  }

  async resolveConflict(req, res) {
    try {
      const { projectSolutionId, globalSolutionId, strategy } = req.body;

      if (!projectSolutionId || !globalSolutionId) {
        return res.status(400).json({
          error: 'Validation failed',
          message: 'Both project and global solution IDs are required'
        });
      }

      const projectSolution = await this.memoryRepository.findById(projectSolutionId);
      const globalSolution = await this.memoryRepository.findById(globalSolutionId);

      if (!projectSolution || !globalSolution) {
        return res.status(404).json({
          error: 'Not found',
          message: 'One or both solutions not found'
        });
      }

      const resolution = await this.conflictResolver.resolveConflict(
        projectSolution, 
        globalSolution, 
        { strategy }
      );

      res.json({
        success: true,
        data: resolution.toJSON(),
        message: 'Conflict resolved successfully'
      });

    } catch (error) {
      console.error('Error resolving conflict:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to resolve conflict',
        details: error.message
      });
    }
  }

  async getConflictHistory(req, res) {
    try {
      const stats = this.conflictResolver.getResolutionStats();
      
      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      console.error('Error getting conflict history:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to get conflict history',
        details: error.message
      });
    }
  }

  async getAnalytics(req, res) {
    try {
      const analytics = await this.memoryRepository.getAnalytics();
      
      res.json({
        success: true,
        data: analytics
      });

    } catch (error) {
      console.error('Error getting analytics:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to get analytics',
        details: error.message
      });
    }
  }

  async getCategoryAnalytics(req, res) {
    try {
      const categoryAnalytics = await this.memoryRepository.getCategoryAnalytics();
      
      res.json({
        success: true,
        data: categoryAnalytics
      });

    } catch (error) {
      console.error('Error getting category analytics:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to get category analytics',
        details: error.message
      });
    }
  }

  async publishEvents(entity) {
    const events = entity.getEvents();
    
    for (const event of events) {
      await this.eventPublisher.publish(event);
    }
    
    entity.clearEvents();
  }

  getRouter() {
    return this.router;
  }
}

module.exports = MemoryController;