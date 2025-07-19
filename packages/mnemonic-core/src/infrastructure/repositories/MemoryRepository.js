/**
 * Memory Repository - Data access layer for memory management
 */

class MemoryRepository {
  constructor() {
    this.memories = new Map();
    this.categories = new Map();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    // Initialize with default categories
    const defaultCategories = [
      { name: 'authentication', description: 'Authentication and authorization issues' },
      { name: 'networking', description: 'Network connectivity and HTTP issues' },
      { name: 'database', description: 'Database connection and query issues' },
      { name: 'filesystem', description: 'File system operations and permissions' },
      { name: 'memory', description: 'Memory allocation and management issues' },
      { name: 'configuration', description: 'Configuration and environment issues' },
      { name: 'api', description: 'API-related issues and integrations' },
      { name: 'concurrency', description: 'Threading and concurrency issues' },
      { name: 'validation', description: 'Data validation and schema issues' },
      { name: 'build', description: 'Build process and dependency issues' },
      { name: 'general', description: 'General category for uncategorized items' }
    ];

    defaultCategories.forEach(cat => {
      this.categories.set(cat.name, cat);
    });

    this.initialized = true;
  }

  async save(memoryEntry) {
    await this.initialize();
    
    this.memories.set(memoryEntry.id, memoryEntry);
    return memoryEntry;
  }

  async findById(id) {
    await this.initialize();
    
    return this.memories.get(id) || null;
  }

  async findAll(options = {}) {
    await this.initialize();
    
    const {
      page = 1,
      limit = 10,
      category,
      confidence,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = options;

    let entries = Array.from(this.memories.values());

    // Filter by category
    if (category) {
      entries = entries.filter(entry => 
        entry.category.name === category
      );
    }

    // Filter by confidence
    if (confidence !== undefined) {
      entries = entries.filter(entry => 
        entry.confidence && entry.confidence.score >= confidence
      );
    }

    // Sort entries
    entries.sort((a, b) => {
      const aValue = a[sortBy];
      const bValue = b[sortBy];
      
      if (sortOrder === 'desc') {
        return bValue > aValue ? 1 : -1;
      } else {
        return aValue > bValue ? 1 : -1;
      }
    });

    // Paginate
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedEntries = entries.slice(start, end);

    return {
      entries: paginatedEntries,
      total: entries.length,
      page,
      limit
    };
  }

  async delete(id) {
    await this.initialize();
    
    return this.memories.delete(id);
  }

  async search(searchOptions) {
    await this.initialize();
    
    const { query, category, confidence, limit = 10 } = searchOptions;
    
    let entries = Array.from(this.memories.values());

    // Simple text search
    if (query) {
      const searchLower = query.toLowerCase();
      entries = entries.filter(entry => 
        entry.problem.toLowerCase().includes(searchLower) ||
        entry.solution.toLowerCase().includes(searchLower)
      );
    }

    // Filter by category
    if (category) {
      entries = entries.filter(entry => 
        entry.category.name === category
      );
    }

    // Filter by confidence
    if (confidence !== undefined) {
      entries = entries.filter(entry => 
        entry.confidence && entry.confidence.score >= confidence
      );
    }

    // Sort by relevance (placeholder - in real implementation would use proper scoring)
    entries.sort((a, b) => {
      const aScore = a.confidence ? a.confidence.score : 0;
      const bScore = b.confidence ? b.confidence.score : 0;
      return bScore - aScore;
    });

    return entries.slice(0, limit);
  }

  async advancedSearch(searchOptions) {
    await this.initialize();
    
    const {
      query,
      categories = [],
      confidenceRange = {},
      dateRange = {},
      limit = 10,
      includeConflicts = false
    } = searchOptions;

    let entries = Array.from(this.memories.values());

    // Text search
    if (query) {
      const searchLower = query.toLowerCase();
      entries = entries.filter(entry => 
        entry.problem.toLowerCase().includes(searchLower) ||
        entry.solution.toLowerCase().includes(searchLower)
      );
    }

    // Filter by categories
    if (categories.length > 0) {
      entries = entries.filter(entry => 
        categories.includes(entry.category.name)
      );
    }

    // Filter by confidence range
    if (confidenceRange.min !== undefined || confidenceRange.max !== undefined) {
      entries = entries.filter(entry => {
        if (!entry.confidence) return false;
        
        const score = entry.confidence.score;
        const minCheck = confidenceRange.min !== undefined ? score >= confidenceRange.min : true;
        const maxCheck = confidenceRange.max !== undefined ? score <= confidenceRange.max : true;
        
        return minCheck && maxCheck;
      });
    }

    // Filter by date range
    if (dateRange.start || dateRange.end) {
      entries = entries.filter(entry => {
        const entryDate = new Date(entry.createdAt);
        const startCheck = dateRange.start ? entryDate >= new Date(dateRange.start) : true;
        const endCheck = dateRange.end ? entryDate <= new Date(dateRange.end) : true;
        
        return startCheck && endCheck;
      });
    }

    // Filter conflicts
    if (!includeConflicts) {
      entries = entries.filter(entry => !entry.hasConflicts());
    }

    return entries.slice(0, limit);
  }

  async getCategories() {
    await this.initialize();
    
    return Array.from(this.categories.values());
  }

  async saveCategory(category) {
    await this.initialize();
    
    this.categories.set(category.name, category);
    return category;
  }

  async getAnalytics() {
    await this.initialize();
    
    const entries = Array.from(this.memories.values());
    const categories = Array.from(this.categories.values());

    const analytics = {
      totalEntries: entries.length,
      totalCategories: categories.length,
      entriesByCategory: {},
      averageConfidence: 0,
      confidenceDistribution: {
        low: 0,
        medium: 0,
        high: 0
      },
      recentEntries: entries
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 10)
        .map(entry => ({
          id: entry.id,
          problem: entry.problem.substring(0, 100),
          category: entry.category.name,
          createdAt: entry.createdAt
        }))
    };

    // Calculate entries by category
    entries.forEach(entry => {
      const categoryName = entry.category.name;
      analytics.entriesByCategory[categoryName] = (analytics.entriesByCategory[categoryName] || 0) + 1;
    });

    // Calculate confidence metrics
    const entriesWithConfidence = entries.filter(entry => entry.confidence);
    if (entriesWithConfidence.length > 0) {
      const totalConfidence = entriesWithConfidence.reduce((sum, entry) => sum + entry.confidence.score, 0);
      analytics.averageConfidence = totalConfidence / entriesWithConfidence.length;

      // Distribution
      entriesWithConfidence.forEach(entry => {
        const score = entry.confidence.score;
        if (score < 0.3) {
          analytics.confidenceDistribution.low++;
        } else if (score < 0.7) {
          analytics.confidenceDistribution.medium++;
        } else {
          analytics.confidenceDistribution.high++;
        }
      });
    }

    return analytics;
  }

  async getCategoryAnalytics() {
    await this.initialize();
    
    const entries = Array.from(this.memories.values());
    const categoryAnalytics = {};

    entries.forEach(entry => {
      const categoryName = entry.category.name;
      
      if (!categoryAnalytics[categoryName]) {
        categoryAnalytics[categoryName] = {
          name: categoryName,
          description: entry.category.description,
          count: 0,
          averageConfidence: 0,
          recentEntries: []
        };
      }

      categoryAnalytics[categoryName].count++;
      categoryAnalytics[categoryName].recentEntries.push({
        id: entry.id,
        problem: entry.problem.substring(0, 100),
        createdAt: entry.createdAt
      });
    });

    // Calculate average confidence per category
    Object.values(categoryAnalytics).forEach(category => {
      const categoryEntries = entries.filter(entry => entry.category.name === category.name);
      const entriesWithConfidence = categoryEntries.filter(entry => entry.confidence);
      
      if (entriesWithConfidence.length > 0) {
        const totalConfidence = entriesWithConfidence.reduce((sum, entry) => sum + entry.confidence.score, 0);
        category.averageConfidence = totalConfidence / entriesWithConfidence.length;
      }

      // Keep only recent entries
      category.recentEntries = category.recentEntries
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5);
    });

    return categoryAnalytics;
  }

  async healthCheck() {
    try {
      await this.initialize();
      
      return {
        status: 'healthy',
        message: 'Memory repository is operational',
        metrics: {
          totalEntries: this.memories.size,
          totalCategories: this.categories.size,
          initialized: this.initialized
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'Memory repository error',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = MemoryRepository;