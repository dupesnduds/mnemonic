/**
 * Security Repository - Data access layer for security and governance
 */

class SecurityRepository {
  constructor() {
    this.tokens = new Map();
    this.sessions = new Map();
    this.auditLogs = [];
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    this.initialized = true;
  }

  async saveToken(token) {
    await this.initialize();
    
    this.tokens.set(token.id, token);
    return token;
  }

  async findTokenById(id) {
    await this.initialize();
    
    return this.tokens.get(id) || null;
  }

  async findAllTokens(options = {}) {
    await this.initialize();
    
    const { limit = 10, offset = 0 } = options;
    const tokens = Array.from(this.tokens.values());
    
    return {
      tokens: tokens.slice(offset, offset + limit),
      total: tokens.length,
      limit,
      offset
    };
  }

  async deleteToken(id) {
    await this.initialize();
    
    return this.tokens.delete(id);
  }

  async saveSession(session) {
    await this.initialize();
    
    this.sessions.set(session.id, session);
    return session;
  }

  async findSessionById(id) {
    await this.initialize();
    
    return this.sessions.get(id) || null;
  }

  async deleteSession(id) {
    await this.initialize();
    
    return this.sessions.delete(id);
  }

  async saveAuditLog(auditLog) {
    await this.initialize();
    
    this.auditLogs.push(auditLog);
    
    // Keep only recent logs (limit to 10000)
    if (this.auditLogs.length > 10000) {
      this.auditLogs.shift();
    }
    
    return auditLog;
  }

  async findAuditLogs(options = {}) {
    await this.initialize();
    
    const { limit = 50, offset = 0, startDate, endDate } = options;
    let logs = [...this.auditLogs];

    // Filter by date range
    if (startDate || endDate) {
      logs = logs.filter(log => {
        const logDate = new Date(log.timestamp);
        const startCheck = startDate ? logDate >= new Date(startDate) : true;
        const endCheck = endDate ? logDate <= new Date(endDate) : true;
        return startCheck && endCheck;
      });
    }

    return {
      logs: logs.slice(offset, offset + limit),
      total: logs.length,
      limit,
      offset,
      filters: { startDate, endDate }
    };
  }

  async healthCheck() {
    try {
      await this.initialize();
      
      return {
        status: 'healthy',
        message: 'Security repository is operational',
        metrics: {
          totalTokens: this.tokens.size,
          totalSessions: this.sessions.size,
          totalAuditLogs: this.auditLogs.length,
          initialized: this.initialized
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'Security repository error',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = SecurityRepository;