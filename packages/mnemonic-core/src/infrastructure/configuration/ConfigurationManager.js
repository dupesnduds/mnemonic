/**
 * Configuration Manager - Centralized configuration management
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class ConfigurationManager {
  constructor(initialConfig = {}) {
    this.config = { ...this.getDefaultConfig(), ...initialConfig };
    this.loadFromFile();
    this.loadFromEnvironment();
  }

  getDefaultConfig() {
    return {
      // Server configuration
      server: {
        port: 8081,
        host: '0.0.0.0',
        timeout: 30000,
        keepAlive: true
      },

      // Database configuration
      database: {
        type: 'file',
        path: './structured_memory.yaml',
        globalPath: './global_structured_memory.yaml',
        backupPath: './backups/',
        maxBackups: 10
      },

      // Memory engine configuration
      memoryEngine: {
        type: 'hybrid', // 'javascript', 'cpp', 'hybrid'
        maxSolutionsPerProblem: 5,
        cacheSize: 1000,
        enableConflictResolution: true
      },

      // Layered retrieval configuration
      layeredRetrieval: {
        enabled: true,
        maxLayers: 3,
        confidenceThresholds: {
          memory_sufficient: 0.70,
          github_expansion: 0.30,
          documentation_minimum: 0.10
        },
        timeouts: {
          memoryLayer: 5000,
          documentationLayer: 10000,
          githubLayer: 15000
        }
      },

      // Conflict resolution configuration
      conflictResolution: {
        recentProjectThresholdDays: 30,
        ageDifferenceThresholdDays: 90,
        popularityRatioThreshold: 3,
        confidenceThreshold: 0.7,
        enableAutomaticResolution: true,
        logResolutions: true
      },

      // Security configuration
      security: {
        enableAuth: true,
        apiKeys: [],
        rateLimiting: {
          enabled: true,
          maxRequestsPerMinute: 100,
          maxRequestsPerHour: 1000
        },
        cors: {
          enabled: true,
          origins: ['*'],
          methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
          headers: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'X-API-Key']
        }
      },

      // Monitoring configuration
      monitoring: {
        enabled: true,
        prometheus: {
          enabled: true,
          path: '/metrics',
          port: 8081
        },
        tracing: {
          enabled: true,
          jaeger: {
            endpoint: 'http://localhost:14268/api/traces'
          }
        },
        logging: {
          level: 'info',
          file: './logs/application.log',
          maxSize: '10m',
          maxFiles: 5
        }
      },

      // External services configuration
      externalServices: {
        github: {
          enabled: false,
          token: null,
          baseUrl: 'https://api.github.com'
        },
        documentation: {
          enabled: true,
          sources: [
            'https://docs.example.com',
            'https://wiki.example.com'
          ]
        }
      }
    };
  }

  loadFromFile() {
    const configPaths = [
      './brains-config.yaml',
      './config/brains-config.yaml',
      './brains-config.json',
      './config/brains-config.json'
    ];

    for (const configPath of configPaths) {
      try {
        if (fs.existsSync(configPath)) {
          console.log(`[ConfigurationManager] Loading configuration from ${configPath}`);
          
          const fileContent = fs.readFileSync(configPath, 'utf8');
          let fileConfig;
          
          if (configPath.endsWith('.yaml') || configPath.endsWith('.yml')) {
            fileConfig = yaml.load(fileContent);
          } else if (configPath.endsWith('.json')) {
            fileConfig = JSON.parse(fileContent);
          }
          
          this.config = this.mergeDeep(this.config, fileConfig);
          console.log(`[ConfigurationManager] Configuration loaded from ${configPath}`);
          break;
        }
      } catch (error) {
        console.warn(`[ConfigurationManager] Failed to load configuration from ${configPath}:`, error.message);
      }
    }
  }

  loadFromEnvironment() {
    const envMappings = {
      'BRAINS_PORT': 'server.port',
      'BRAINS_HOST': 'server.host',
      'BRAINS_ENABLE_AUTH': 'security.enableAuth',
      'BRAINS_API_KEYS': 'security.apiKeys',
      'BRAINS_RATE_LIMIT': 'security.rateLimiting.maxRequestsPerMinute',
      'BRAINS_MEMORY_TYPE': 'memoryEngine.type',
      'BRAINS_ENABLE_MONITORING': 'monitoring.enabled',
      'BRAINS_LOG_LEVEL': 'monitoring.logging.level',
      'BRAINS_GITHUB_TOKEN': 'externalServices.github.token',
      'BRAINS_GITHUB_ENABLED': 'externalServices.github.enabled'
    };

    for (const [envKey, configPath] of Object.entries(envMappings)) {
      const envValue = process.env[envKey];
      if (envValue !== undefined) {
        this.setNestedValue(this.config, configPath, this.parseEnvValue(envValue));
        console.log(`[ConfigurationManager] Set ${configPath} from environment variable ${envKey}`);
      }
    }
  }

  parseEnvValue(value) {
    // Handle boolean values
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    
    // Handle numeric values
    if (!isNaN(value)) {
      return parseFloat(value);
    }
    
    // Handle arrays (comma-separated)
    if (value.includes(',')) {
      return value.split(',').map(item => item.trim());
    }
    
    // Return as string
    return value;
  }

  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }
    
    current[keys[keys.length - 1]] = value;
  }

  mergeDeep(target, source) {
    const output = { ...target };
    
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            output[key] = source[key];
          } else {
            output[key] = this.mergeDeep(target[key], source[key]);
          }
        } else {
          output[key] = source[key];
        }
      });
    }
    
    return output;
  }

  isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  // Public methods
  get(path, defaultValue = null) {
    const keys = path.split('.');
    let current = this.config;
    
    for (const key of keys) {
      if (current === null || current === undefined || !(key in current)) {
        return defaultValue;
      }
      current = current[key];
    }
    
    return current;
  }

  set(path, value) {
    this.setNestedValue(this.config, path, value);
  }

  getAll() {
    return { ...this.config };
  }

  validate() {
    const errors = [];
    
    // Validate required configuration
    if (!this.get('server.port')) {
      errors.push('Server port is required');
    }
    
    if (this.get('security.enableAuth') && (!this.get('security.apiKeys') || this.get('security.apiKeys').length === 0)) {
      errors.push('API keys are required when authentication is enabled');
    }
    
    if (this.get('monitoring.enabled') && !this.get('monitoring.prometheus.enabled')) {
      errors.push('Prometheus monitoring is required when monitoring is enabled');
    }
    
    return errors;
  }

  async healthCheck() {
    const errors = this.validate();
    
    return {
      status: errors.length === 0 ? 'healthy' : 'unhealthy',
      message: errors.length === 0 ? 'Configuration is valid' : 'Configuration validation failed',
      errors: errors,
      timestamp: new Date().toISOString()
    };
  }

  // Environment-specific configurations
  isDevelopment() {
    return process.env.NODE_ENV === 'development';
  }

  isProduction() {
    return process.env.NODE_ENV === 'production';
  }

  isTest() {
    return process.env.NODE_ENV === 'test';
  }
}

module.exports = ConfigurationManager;