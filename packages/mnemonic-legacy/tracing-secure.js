// tracing-secure.js - Secure OpenTelemetry configuration with PII protection
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base');

// PII Sanitization Processor
class PIISanitizationProcessor {
  constructor() {
    this.sensitiveAttributes = [
      'http.request.body',
      'http.response.body',
      'user.email',
      'user.id',
      'auth.token',
      'api.key'
    ];
    
    this.sensitivePatterns = [
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email
      /\b[A-Za-z0-9]{32,}\b/g, // API keys/tokens
      /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, // Bearer tokens
      /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, // Credit cards
      /\b(?:password|pwd|secret|token|key)\s*[:=]\s*['"]?[^\s'"]+/gi // Key-value pairs
    ];
  }

  sanitizeValue(value) {
    if (typeof value !== 'string') {
      return value;
    }

    let sanitized = value;
    this.sensitivePatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    });

    return sanitized;
  }

  sanitizeAttributes(attributes) {
    const sanitized = {};
    
    for (const [key, value] of Object.entries(attributes)) {
      if (this.sensitiveAttributes.includes(key)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = this.sanitizeValue(value);
      }
    }

    return sanitized;
  }

  onStart(span, parentContext) {
    // Sanitize span attributes on start
    const attributes = span.attributes;
    if (attributes) {
      const sanitized = this.sanitizeAttributes(attributes);
      span.setAttributes(sanitized);
    }
  }

  onEnd(span) {
    // Additional sanitization on span end
    const attributes = span.attributes;
    if (attributes) {
      const sanitized = this.sanitizeAttributes(attributes);
      span.setAttributes(sanitized);
    }
  }

  shutdown() {
    return Promise.resolve();
  }

  forceFlush() {
    return Promise.resolve();
  }
}

// Sampling configuration for cost optimization
const getSampler = () => {
  const samplingRate = parseFloat(process.env.OTEL_SAMPLING_RATE || '0.1'); // 10% by default
  
  if (process.env.NODE_ENV === 'production') {
    // Lower sampling in production to reduce costs
    return {
      shouldSample: () => {
        return Math.random() < samplingRate ? { decision: 1 } : { decision: 0 };
      }
    };
  }
  
  // Full sampling in development
  return {
    shouldSample: () => ({ decision: 1 })
  };
};

// Configure secure Jaeger exporter
const jaegerExporter = new JaegerExporter({
  serviceName: 'brains-memory-mcp',
  endpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
  tags: {
    environment: process.env.NODE_ENV || 'development',
    version: process.env.APP_VERSION || '2.0.0'
  }
});

// Create span processor with PII sanitization
const spanProcessor = new BatchSpanProcessor(jaegerExporter, {
  maxQueueSize: 2048,
  maxExportBatchSize: 512,
  scheduledDelayMillis: 5000
});

// Initialize the OpenTelemetry SDK with security configurations
const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'brains-memory-mcp',
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.APP_VERSION || '2.0.0',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
    [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: process.env.HOSTNAME || 'localhost'
  }),
  spanProcessor,
  instrumentations: [
    new HttpInstrumentation({
      // Security: Don't capture sensitive headers
      ignoreSensitiveHeaders: true,
      
      // Ignore health check requests to reduce noise
      ignoreIncomingRequestHook: (req) => {
        const ignorePaths = ['/health', '/metrics', '/favicon.ico'];
        return ignorePaths.includes(req.url);
      },
      
      // Sanitize request/response data
      requestHook: (span, request) => {
        // Remove sensitive headers
        const sanitizedHeaders = {};
        for (const [key, value] of Object.entries(request.headers || {})) {
          if (['authorization', 'x-api-key', 'cookie'].includes(key.toLowerCase())) {
            sanitizedHeaders[key] = '[REDACTED]';
          } else {
            sanitizedHeaders[key] = value;
          }
        }
        span.setAttributes({
          'http.request.headers': JSON.stringify(sanitizedHeaders)
        });
      },
      
      responseHook: (span, response) => {
        // Don't capture response body for security
        span.setAttributes({
          'http.response.status_code': response.statusCode
        });
      }
    }),
    
    new ExpressInstrumentation({
      // Filter out middleware layers we don't want to trace
      ignoreLayers: [
        (name, info) => {
          const ignorePatterns = ['query', 'body-parser', 'cors', 'helmet'];
          return ignorePatterns.some(pattern => name.includes(pattern));
        }
      ],
      
      // Don't capture request/response bodies
      ignoreRequestHook: (info) => {
        return info.request.url === '/metrics' || info.request.url === '/health';
      }
    })
  ]
});

// Start the tracing SDK
try {
  sdk.start();
  console.log('🔒 Secure OpenTelemetry tracing initialized');
  console.log(`📊 Sampling rate: ${process.env.OTEL_SAMPLING_RATE || '0.1'}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📡 Jaeger endpoint: ${jaegerExporter.endpoint}`);
} catch (error) {
  console.error('❌ Error initializing secure tracing:', error);
}

// Graceful shutdown with security cleanup
process.on('SIGTERM', async () => {
  try {
    await sdk.shutdown();
    console.log('🔒 Secure tracing SDK shutdown complete');
  } catch (error) {
    console.error('❌ Error shutting down secure tracing SDK:', error);
  } finally {
    process.exit(0);
  }
});

// Export the tracer for custom instrumentation
const { trace } = require('@opentelemetry/api');
const tracer = trace.getTracer('brains-memory-mcp', '2.0.0');

// Secure tracing helper functions
const secureTrace = {
  // Create a span with automatic PII sanitization
  createSpan(name, attributes = {}, callback) {
    return tracer.startActiveSpan(name, { attributes }, (span) => {
      try {
        // Sanitize attributes
        const piiProcessor = new PIISanitizationProcessor();
        const sanitizedAttrs = piiProcessor.sanitizeAttributes(attributes);
        span.setAttributes(sanitizedAttrs);
        
        const result = callback(span);
        
        if (result && typeof result.then === 'function') {
          // Handle promises
          return result
            .then(res => {
              span.setStatus({ code: 1 }); // OK
              return res;
            })
            .catch(error => {
              span.recordException(error);
              span.setStatus({ code: 2, message: error.message }); // ERROR
              throw error;
            })
            .finally(() => {
              span.end();
            });
        } else {
          // Handle synchronous operations
          span.setStatus({ code: 1 }); // OK
          span.end();
          return result;
        }
      } catch (error) {
        span.recordException(error);
        span.setStatus({ code: 2, message: error.message });
        span.end();
        throw error;
      }
    });
  },

  // Add context without PII
  addSecureContext(span, context) {
    const piiProcessor = new PIISanitizationProcessor();
    const sanitizedContext = piiProcessor.sanitizeAttributes(context);
    span.setAttributes(sanitizedContext);
  },

  // Record error without sensitive information
  recordSecureError(span, error) {
    const sanitizedError = {
      name: error.name,
      message: error.message.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]'),
      stack: error.stack ? error.stack.split('\n').slice(0, 5).join('\n') : undefined
    };
    span.recordException(sanitizedError);
  }
};

module.exports = {
  tracer,
  secureTrace,
  sdk
};