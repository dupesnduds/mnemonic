// lib/prometheus_metrics.js
// Prometheus metrics collection for Brains Memory System

const client = require('prom-client');

// Create a Registry which registers the metrics
const register = new client.Registry();

// Define application version and engine type gauge
const memoryEngineType = new client.Gauge({
  name: 'memory_engine_type',
  help: 'Memory engine type: 0=C++, 1=JavaScript',
  labelNames: ['engine']
});

// Counters for memory lookup requests and results
const memoryLookupTotal = new client.Counter({
  name: 'memory_lookup_requests_total',
  help: 'Total number of memory lookup requests',
  labelNames: ['category']
});

const memoryLookupHits = new client.Counter({
  name: 'memory_lookup_hits_total',
  help: 'Total number of memory lookup hits',
  labelNames: ['category']
});

const memoryLookupMisses = new client.Counter({
  name: 'memory_lookup_misses_total',
  help: 'Total number of memory lookup misses',
  labelNames: ['category']
});

// Gauge for total stored solutions by category and source (C++/JS)
const memorySolutions = new client.Gauge({
  name: 'memory_solutions_total',
  help: 'Current total solutions stored',
  labelNames: ['category', 'source']
});

// Counter for conflicts resolved by type (replace, reject)
const memoryConflictsResolved = new client.Counter({
  name: 'memory_conflicts_resolved_total',
  help: 'Total number of memory conflicts resolved',
  labelNames: ['resolution_type']
});

// Counter for memory backup operations
const memoryBackupOps = new client.Counter({
  name: 'memory_backup_operations_total',
  help: 'Total number of memory backup operations'
});

// Histogram for file load durations in seconds
const memoryFileLoadDuration = new client.Histogram({
  name: 'memory_file_load_duration_seconds',
  help: 'Duration of memory file load operations',
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});

// Register the metrics
register.registerMetric(memoryEngineType);
register.registerMetric(memoryLookupTotal);
register.registerMetric(memoryLookupHits);
register.registerMetric(memoryLookupMisses);
register.registerMetric(memorySolutions);
register.registerMetric(memoryConflictsResolved);
register.registerMetric(memoryBackupOps);
register.registerMetric(memoryFileLoadDuration);

// Default metrics (CPU, memory usage)
client.collectDefaultMetrics({ register });

module.exports = {
  register,
  memoryEngineType,
  memoryLookupTotal,
  memoryLookupHits,
  memoryLookupMisses,
  memorySolutions,
  memoryConflictsResolved,
  memoryBackupOps,
  memoryFileLoadDuration
};