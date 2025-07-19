/**
 * Search Repository - Data access layer for search sessions
 */

class SearchRepository {
  constructor() {
    this.sessions = new Map();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    this.initialized = true;
  }

  async save(searchSession) {
    await this.initialize();
    
    this.sessions.set(searchSession.id, searchSession);
    return searchSession;
  }

  async findById(id) {
    await this.initialize();
    
    return this.sessions.get(id) || null;
  }

  async findAll(options = {}) {
    await this.initialize();
    
    const { limit = 10, offset = 0 } = options;
    const sessions = Array.from(this.sessions.values());
    
    return {
      sessions: sessions.slice(offset, offset + limit),
      total: sessions.length,
      limit,
      offset
    };
  }

  async delete(id) {
    await this.initialize();
    
    return this.sessions.delete(id);
  }

  async healthCheck() {
    try {
      await this.initialize();
      
      return {
        status: 'healthy',
        message: 'Search repository is operational',
        metrics: {
          totalSessions: this.sessions.size,
          initialized: this.initialized
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'Search repository error',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = SearchRepository;