// tracing.js - OpenTelemetry initialization for Brains Memory System
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

// Configure the Jaeger exporter
const jaegerExporter = new JaegerExporter({
  serviceName: 'brains-memory-mcp',
  endpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
});

// Initialize the OpenTelemetry SDK
const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'brains-memory-mcp',
    [SemanticResourceAttributes.SERVICE_VERSION]: '2.0.0',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
  }),
  traceExporter: jaegerExporter,
  instrumentations: [
    new HttpInstrumentation({
      // Ignore health check requests to reduce noise
      ignoreIncomingRequestHook: (req) => {
        return req.url === '/health' || req.url === '/metrics';
      },
    }),
    new ExpressInstrumentation({
      // Add route information to span names
      ignoreLayers: [
        // Filter out middleware layers we don't want to trace
        (name) => name === 'query' || name === 'body-parser',
      ],
    }),
  ],
});

// Start the tracing SDK
sdk.start()
  .then(() => {
    console.log('OpenTelemetry tracing initialized successfully');
    console.log(`Service: brains-memory-mcp`);
    console.log(`Jaeger endpoint: ${jaegerExporter.endpoint}`);
  })
  .catch((error) => {
    console.error('Error initializing OpenTelemetry tracing:', error);
  });

// Graceful shutdown
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('Tracing SDK shutdown complete'))
    .catch((error) => console.error('Error shutting down tracing SDK:', error))
    .finally(() => process.exit(0));
});

// Export the tracer for custom instrumentation
const { trace } = require('@opentelemetry/api');
const tracer = trace.getTracer('brains-memory-mcp', '2.0.0');

module.exports = {
  tracer,
  sdk,
};