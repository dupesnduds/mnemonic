// Initialize secure tracing before any other imports
require('./tracing-secure');

const express = require('express');
const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');
const { tracer, secureTrace } = require('./tracing-secure');
const SecurityManager = require('./security/auth');
const {
  register,
  memoryEngineType,
  memoryLookupTotal,
  memoryLookupHits,
  memoryLookupMisses,
  memorySolutions,
  memoryConflictsResolved,
  memoryFileLoadDuration
} = require('./lib/prometheus_metrics');

// Enhanced system integration
const CLIIntegration = require('./lib/cli_integration');

const app = express();
const PORT = 8081;

// Initialize enhanced system
const cliIntegration = new CLIIntegration();

// Initialize security manager
const securityManager = new SecurityManager({
  enableAuth: process.env.BRAINS_ENABLE_AUTH !== 'false',
  maxRequestsPerMinute: parseInt(process.env.BRAINS_RATE_LIMIT) || 100
});

// Store instances for middleware access
app.locals.securityManager = securityManager;
app.locals.cliIntegration = cliIntegration;

// Apply security middleware
app.use(securityManager.securityHeaders.bind(securityManager));
app.use(securityManager.rateLimit.bind(securityManager));
app.use(express.json({ limit: '1mb' })); // Limit payload size
app.use(securityManager.sanitizeMiddleware.bind(securityManager));

// Initialize engine type gauge
const engineType = process.env.MEMORY_ENGINE_TYPE || 'JavaScript';
memoryEngineType.set({ engine: engineType }, engineType === 'C++' ? 0 : 1);

// Logging function with trace correlation
function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  let traceId = 'no-trace';
  
  try {
    const { trace } = require('@opentelemetry/api');
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      traceId = activeSpan.spanContext().traceId;
    }
  } catch (error) {
    // Trace not available, continue without trace ID
  }
  
  const logMessage = `${timestamp} [${level}] [trace:${traceId}] ${message}\n`;
  
  console.log(`[${level}] [trace:${traceId}] ${message}`);
  
  try {
    fs.appendFileSync('mcp.log', logMessage);
  } catch (error) {
    console.error('Failed to write to log file:', error.message);
  }
}

// Load error categories dynamically
function loadErrorCategories() {
  try {
    const errorCategoriesPath = './error_categories.yaml';
    if (fs.existsSync(errorCategoriesPath)) {
      const data = yaml.load(fs.readFileSync(errorCategoriesPath, 'utf8'));
      return data.error_categories || {};
    }
  } catch (error) {
    console.warn('Failed to load error categories, using defaults:', error.message);
  }
  
  // Fallback defaults
  return {
    authentication: "(intent|callback).*oauth|auth.*fail|token.*invalid",
    networking: "http.*timeout|connection.*refused|network.*error",
    database: "(db|database).*(fail|connection)|sql.*error",
    filesystem: "file.*not.*found|permission.*denied|disk.*full",
    memory: "out.*of.*memory|memory.*leak|allocation.*failed",
    configuration: "config.*invalid|missing.*env|property.*undefined"
  };
}

// Categorize error based on regex patterns
function categoriseError(errorMessage) {
  return tracer.startActiveSpan('categoriseError', { attributes: { 'error.message': errorMessage } }, (span) => {
    const errorCategories = loadErrorCategories();
    
    for (const [category, pattern] of Object.entries(errorCategories)) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(errorMessage)) {
        span.setAttributes({ 'error.category': category });
        span.end();
        return category;
      }
    }
    
    span.setAttributes({ 'error.category': 'errors_uncategorised' });
    span.end();
    return 'errors_uncategorised';
  });
}

// Load memory data with error handling and backup recovery
function loadMemoryData(filePath) {
  return tracer.startActiveSpan('loadMemoryData', { attributes: { 'file.path': filePath } }, (span) => {
    const startTime = Date.now();
    
    try {
      if (!fs.existsSync(filePath)) {
        log(`Memory file not found: ${filePath}`, 'WARN');
        span.setStatus({ code: 1, message: 'File not found' });
        return { lessons_learned: {} };
      }
      
      const data = yaml.load(fs.readFileSync(filePath, 'utf8'));
      log(`Successfully loaded memory data from ${filePath}`);
      span.setAttributes({ 'file.size': fs.statSync(filePath).size });
      return data || { lessons_learned: {} };
    } catch (error) {
      log(`Error loading memory data from ${filePath}: ${error.message}`, 'ERROR');
      span.recordException(error);
      span.setStatus({ code: 2, message: error.message });
      
      // Try to recover from backup if primary file is corrupted
      if (filePath === './structured_memory.yaml' && fs.existsSync('backups')) {
        try {
          const backups = fs.readdirSync('backups')
            .filter(file => file.startsWith('structured_memory_') && file.endsWith('.yaml'))
            .sort()
            .reverse();
          
          if (backups.length > 0) {
            const backupPath = path.join('backups', backups[0]);
            log(`Attempting recovery from backup: ${backupPath}`, 'WARN');
            const backupData = yaml.load(fs.readFileSync(backupPath, 'utf8'));
            log(`Successfully recovered from backup: ${backupPath}`, 'INFO');
            span.setAttributes({ 'backup.recovered': true, 'backup.path': backupPath });
            return backupData || { lessons_learned: {} };
          }
        } catch (backupError) {
          log(`Backup recovery failed: ${backupError.message}`, 'ERROR');
          span.recordException(backupError);
        }
      }
      
      return { lessons_learned: {} };
    } finally {
      const duration = (Date.now() - startTime) / 1000;
      memoryFileLoadDuration.observe(duration);
      span.setAttributes({ 'operation.duration': duration });
      span.end();
    }
  });
}

// Load both project-specific and global memory
function loadAllMemoryData() {
  const projectMemory = loadMemoryData('./structured_memory.yaml');
  const globalMemory = loadMemoryData('./global_structured_memory.yaml');
  
  return { projectMemory, globalMemory };
}

// Find solution with enhanced conflict resolution and prioritization
function findSolution(problem, category) {
  const { projectMemory, globalMemory } = loadAllMemoryData();
  
  const projectSolution = projectMemory.lessons_learned[category]?.[problem];
  const globalSolution = globalMemory.lessons_learned[category]?.[problem];
  
  // If only one solution exists, return it (with age validation for global)
  if (projectSolution && !globalSolution) {
    return {
      solution: projectSolution,
      source: 'project'
    };
  }
  
  if (globalSolution && !projectSolution) {
    // Validate global solution age
    try {
      const createdDate = new Date(globalSolution.created_date);
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      
      if (createdDate > sixMonthsAgo) {
        return {
          solution: globalSolution,
          source: 'global'
        };
      }
    } catch (error) {
      log(`Invalid date in global solution: ${error.message}`, 'WARN');
    }
    return null;
  }
  
  // If both solutions exist, resolve conflict based on recency and use count
  if (projectSolution && globalSolution) {
    log(`Conflict detected for ${category}/${problem} - resolving...`, 'INFO');
    
    try {
      const projectDate = new Date(projectSolution.created_date);
      const globalDate = new Date(globalSolution.created_date);
      const projectUseCount = projectSolution.use_count || 1;
      const globalUseCount = globalSolution.use_count || 1;
      
      // Priority rules (in order):
      // 1. Project solutions always win if created within last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      if (projectDate > thirtyDaysAgo) {
        log(`Using recent project solution (created: ${projectDate.toISOString()})`, 'INFO');
        memoryConflictsResolved.inc({ resolution_type: 'recent_project_priority' });
        return {
          solution: projectSolution,
          source: 'project',
          conflict_resolution: 'recent_project_priority'
        };
      }
      
      // 2. Use the more recent solution if age difference > 90 days
      const ageDiffDays = Math.abs(projectDate.getTime() - globalDate.getTime()) / (1000 * 60 * 60 * 24);
      
      if (ageDiffDays > 90) {
        const newerSolution = projectDate > globalDate ? 
          { solution: projectSolution, source: 'project' } :
          { solution: globalSolution, source: 'global' };
        
        log(`Using newer solution (age difference: ${ageDiffDays.toFixed(0)} days)`, 'INFO');
        memoryConflictsResolved.inc({ resolution_type: 'newer_solution' });
        return {
          ...newerSolution,
          conflict_resolution: 'newer_solution'
        };
      }
      
      // 3. Use solution with higher use count if difference is significant (>3x)
      const useCountRatio = Math.max(projectUseCount, globalUseCount) / Math.min(projectUseCount, globalUseCount);
      
      if (useCountRatio > 3) {
        const popularSolution = projectUseCount > globalUseCount ?
          { solution: projectSolution, source: 'project' } :
          { solution: globalSolution, source: 'global' };
        
        log(`Using more popular solution (use counts: project=${projectUseCount}, global=${globalUseCount})`, 'INFO');
        memoryConflictsResolved.inc({ resolution_type: 'popularity_based' });
        return {
          ...popularSolution,
          conflict_resolution: 'popularity_based'
        };
      }
      
      // 4. Default to project solution (local preference)
      log(`Using project solution (default local preference)`, 'INFO');
      memoryConflictsResolved.inc({ resolution_type: 'default_local_preference' });
      return {
        solution: projectSolution,
        source: 'project',
        conflict_resolution: 'default_local_preference'
      };
      
    } catch (error) {
      log(`Error in conflict resolution: ${error.message}`, 'ERROR');
      // Fallback to project solution
      memoryConflictsResolved.inc({ resolution_type: 'error_fallback' });
      return {
        solution: projectSolution,
        source: 'project',
        conflict_resolution: 'error_fallback'
      };
    }
  }
  
  return null;
}

// Health endpoint
app.get('/health', (req, res) => {
  log('Health check requested');
  
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    memory_files: {
      project: fs.existsSync('./structured_memory.yaml'),
      global: fs.existsSync('./global_structured_memory.yaml'),
      error_categories: fs.existsSync('./error_categories.yaml')
    }
  };
  
  res.json(health);
});

// Enhanced memory lookup endpoint with layered retrieval
app.post('/', async (req, res) => {
  tracer.startActiveSpan('memoryLookup', { attributes: { 'http.route': '/' } }, async (span) => {
    try {
      const { problem, options = {} } = req.body;
      log(`Memory lookup request: ${problem ? problem.substring(0, 50) : 'empty'}...`);
      
      if (!problem) {
        log('Invalid request: missing problem description', 'WARN');
        span.setStatus({ code: 2, message: 'Missing problem description' });
        span.end();
        return res.status(400).json({ 
          error: 'Problem description required',
          usage: 'POST / with {"problem": "error description", "options": {...}}'
        });
      }
      
      const category = categoriseError(problem);
      span.setAttributes({ 'problem.category': category });
      
      // Track total lookup requests
      memoryLookupTotal.inc({ category });
      
      // Use enhanced search if available, fall back to legacy
      let result;
      try {
        // Try enhanced layered retrieval
        const enhancedOptions = {
          category: category,
          maxLayers: options.maxLayers || 1, // Default to memory-only for backward compatibility
          allowGitHub: options.allowGitHub || false,
          allowDocs: options.allowDocs || false,
          ...options
        };
        
        result = await cliIntegration.search(problem, enhancedOptions);
        
        if (result.success) {
          log(`Enhanced solution found (${Math.round(result.confidence * 100)}% confidence): ${result.termination_reason}`);
          memoryLookupHits.inc({ category });
          span.setAttributes({ 
            'lookup.found': true, 
            'lookup.enhanced': true,
            'lookup.confidence': result.confidence,
            'lookup.layers_used': result.search_metadata.layers_used,
            'lookup.external_calls': result.search_metadata.external_calls_made,
            'lookup.termination_reason': result.termination_reason
          });
          
          res.json({
            category,
            solution: result.solution,
            source: 'enhanced_system',
            found: true,
            confidence: result.confidence,
            layers_used: result.search_metadata.layers_used,
            external_calls_made: result.search_metadata.external_calls_made,
            termination_reason: result.termination_reason,
            enhanced: true
          });
          return;
        }
      } catch (enhancedError) {
        log(`Enhanced search failed, falling back to legacy: ${enhancedError.message}`, 'WARN');
        span.setAttributes({ 'lookup.enhanced_fallback': true });
      }
      
      // Fallback to legacy search
      result = findSolution(problem, category);
      
      if (result) {
        log(`Legacy solution found for category: ${category}, source: ${result.source}`);
        memoryLookupHits.inc({ category });
        span.setAttributes({ 
          'lookup.found': true, 
          'lookup.source': result.source,
          'conflict.resolution': result.conflict_resolution || 'none',
          'lookup.legacy': true
        });
        
        res.json({
          category,
          solution: result.solution,
          source: result.source,
          found: true,
          conflict_resolution: result.conflict_resolution,
          enhanced: false
        });
      } else {
        log(`No solution found for category: ${category}`);
        memoryLookupMisses.inc({ category });
        span.setAttributes({ 'lookup.found': false });
        
        res.json({
          category,
          solution: null,
          source: null,
          found: false,
          message: `No solution found for category: ${category}`,
          enhanced: false
        });
      }
    } catch (error) {
      log(`Error processing request: ${error.message}`, 'ERROR');
      span.recordException(error);
      span.setStatus({ code: 2, message: error.message });
      
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    } finally {
      span.end();
    }
  });
});

// Prometheus metrics endpoint (secured)
app.get('/metrics', securityManager.requireApiKey.bind(securityManager), async (req, res) => {
  try {
    securityManager.auditLog(req, res, 'metrics_access');
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    log(`Error generating metrics: ${error.message}`, 'ERROR');
    securityManager.auditLog(req, res, 'metrics_access', 'error');
    res.status(500).end('Error generating metrics');
  }
});

// Enhanced statistics endpoint (secured)
app.get('/stats', securityManager.requireApiKey.bind(securityManager), async (req, res) => {
  try {
    const { projectMemory, globalMemory } = loadAllMemoryData();
    
    // Update solution count gauges
    Object.entries(projectMemory.lessons_learned || {}).forEach(([category, solutions]) => {
      memorySolutions.set({ category, source: 'project' }, Object.keys(solutions).length);
    });
    
    Object.entries(globalMemory.lessons_learned || {}).forEach(([category, solutions]) => {
      memorySolutions.set({ category, source: 'global' }, Object.keys(solutions).length);
    });
    
    let enhancedStats = {};
    try {
      enhancedStats = await cliIntegration.getStats();
    } catch (error) {
      log(`Enhanced stats failed: ${error.message}`, 'WARN');
    }
    
    const stats = {
      legacy_memory: {
        project_memory: {
          categories: Object.keys(projectMemory.lessons_learned || {}).length,
          total_solutions: Object.values(projectMemory.lessons_learned || {})
            .reduce((sum, cat) => sum + Object.keys(cat).length, 0)
        },
        global_memory: {
          categories: Object.keys(globalMemory.lessons_learned || {}).length,
          total_solutions: Object.values(globalMemory.lessons_learned || {})
            .reduce((sum, cat) => sum + Object.keys(cat).length, 0)
        },
        error_categories: Object.keys(loadErrorCategories()).length
      },
      enhanced_system: enhancedStats
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Error generating stats:', error.message);
    res.status(500).json({ error: 'Failed to generate statistics' });
  }
});

// Enhanced system status endpoint (secured)
app.get('/status', securityManager.requireApiKey.bind(securityManager), async (req, res) => {
  try {
    let systemStatus = {};
    try {
      systemStatus = await cliIntegration.getStatus();
    } catch (error) {
      log(`Enhanced status failed: ${error.message}`, 'WARN');
      systemStatus = { error: error.message };
    }
    
    res.json({
      timestamp: new Date().toISOString(),
      server: 'memory-mcp',
      port: PORT,
      enhanced_system: systemStatus,
      memory_files: {
        project: fs.existsSync('./structured_memory.yaml'),
        global: fs.existsSync('./global_structured_memory.yaml'),
        error_categories: fs.existsSync('./error_categories.yaml'),
        config: fs.existsSync('./brains-config.yaml')
      }
    });
  } catch (error) {
    console.error('Error generating status:', error.message);
    res.status(500).json({ error: 'Failed to generate status' });
  }
});

// Enhanced system test endpoint (secured)
app.post('/test', securityManager.requireApiKey.bind(securityManager), async (req, res) => {
  try {
    log('Running enhanced system test...', 'INFO');
    const testResult = await cliIntegration.test();
    
    res.json({
      test_completed: true,
      timestamp: new Date().toISOString(),
      ...testResult
    });
  } catch (error) {
    console.error('Error running test:', error.message);
    res.status(500).json({ 
      test_completed: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Start server with error handling
app.listen(PORT, (err) => {
  if (err) {
    log(`Failed to start MCP server: ${err.message}`, 'ERROR');
    process.exit(1);
  }
  log(`Memory MCP server started on port ${PORT}`);
  log(`Health check available at: http://localhost:${PORT}/health`);
  log(`Statistics available at: http://localhost:${PORT}/stats (requires API key)`);
  log(`Prometheus metrics available at: http://localhost:${PORT}/metrics (requires API key)`);
  
  // Security manager periodic cleanup
  setInterval(() => {
    securityManager.cleanup();
  }, 60000); // Clean up every minute
});

// Graceful shutdown
process.on('SIGINT', () => {
  log('Received SIGINT, shutting down gracefully...', 'INFO');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Received SIGTERM, shutting down gracefully...', 'INFO');
  process.exit(0);
});