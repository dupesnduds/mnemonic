# Mnemonic Memory System

> High-performance structured memory system developed in New Zealand with native C++ capabilities and comprehensive Claude integration.

## Overview

Mnemonic is a monorepo containing multiple packages that work together to provide a robust, scalable memory management system with both JavaScript and C++ implementations.

## Packages

### Core Packages

- **[@mnemonic/core](packages/mnemonic-core)** - Main memory system with domain-driven architecture
- **[@mnemonic/native](packages/mnemonic-native)** - High-performance C++ addon for critical operations
- **[@mnemonic/cli](packages/mnemonic-cli)** - Command-line tools for memory management
- **[@mnemonic/utils](packages/mnemonic-utils)** - Python utilities for monitoring and maintenance

### Supporting Packages

- **[@mnemonic/legacy](packages/mnemonic-legacy)** - Legacy MCP server (deprecated)

## Quick Start

### Prerequisites

- Node.js >= 16.0.0
- Python >= 3.8 (for utilities)
- C++ compiler (for native addon)

### Installation

```bash
# Install all dependencies and build native addon
npm run install:all

# Or install step by step
npm install
npm run build:native
```

### Running the System

```bash
# Start with C++ engine (recommended for production)
npm run dev

# Start with JavaScript engine only
npm run dev:js

# Start legacy MCP server
npm run dev:legacy
```

## Development

### Building

```bash
# Build all packages
npm run build

# Build native addon only
npm run build:native

# Clean all builds
npm run clean
```

### Testing

```bash
# Run tests for all packages
npm test

# Test specific package
npm test --workspace=packages/mnemonic-core
```

### Linting and Type Checking

```bash
# Lint all packages
npm run lint

# Type check all packages
npm run typecheck
```

## Configuration

Copy `.env.example` to `.env` and configure your environment variables:

```bash
cp .env.example .env
```

Key configuration options:

- `MNEMONIC_ENABLE_AUTH` - Enable/disable authentication
- `MNEMONIC_API_KEYS` - Comma-separated API keys
- `MEMORY_ENGINE_TYPE` - Choose 'C++' or 'JavaScript'
- `MNEMONIC_PORT` - Server port (default: 8081)

## Architecture

### Monorepo Structure

```
mnemonic/
├── packages/
│   ├── mnemonic-core/           # Main application
│   ├── mnemonic-native/         # C++ addon
│   ├── mnemonic-cli/            # CLI tools
│   ├── mnemonic-utils/          # Python utilities
│   └── mnemonic-legacy/         # Legacy system
├── infrastructure/             # DevOps configs
│   ├── docker/
│   ├── monitoring/
│   └── deployment/
└── docs/                       # Documentation
```

### Core Components

1. **Domain Layer** - Business logic and entities
2. **Infrastructure Layer** - External services and repositories  
3. **Presentation Layer** - API controllers and routers
4. **Native Layer** - C++ performance optimisations

## API Documentation

The system exposes RESTful APIs on port 8081 (configurable):

- `GET /api/v2/memory` - Retrieve memory entries
- `POST /api/v2/memory` - Store memory entries
- `GET /api/v2/security` - Security management
- `GET /health` - Health check endpoint

## Monitoring

### Observability Stack

- **Prometheus** - Metrics collection
- **Grafana** - Visualisation dashboards
- **Jaeger** - Distributed tracing
- **Custom SLI/SLO** - Performance monitoring

Start monitoring stack:

```bash
cd infrastructure/docker
docker-compose up -d
```

Access dashboards:
- Grafana: http://localhost:3000
- Prometheus: http://localhost:9090
- Jaeger: http://localhost:16686

## CLI Usage

```bash
# Basic memory operations
mnemonic store "key" "value"
mnemonic retrieve "key"

# System management
mnemonic-coach analyse
mnemonic-intercept start

# Shell integration
source packages/mnemonic-cli/shell/mnemonic-shell-integration.sh
```

## Python Utilities

```bash
# Check memory health
cd packages/mnemonic-utils
python scripts/check_memory.py

# Monitor logs
python scripts/monitor_logs.py

# Update memory configurations
python scripts/update_memory.py
```

## Production Deployment

### Docker Deployment

```bash
cd infrastructure/docker
docker-compose -f docker-compose.prod.yml up -d
```

### Environment Setup

Ensure these environment variables are set in production:

- `NODE_ENV=production`
- `MNEMONIC_ENABLE_AUTH=true`
- `MNEMONIC_API_KEYS=your-production-keys`
- `GRAFANA_ADMIN_PASSWORD=secure-password`

### Security Considerations

- API keys are required in production
- CORS is restricted to allowed origins
- All inputs are validated and sanitised
- Session management includes expiration and role-based access

## Performance

### Benchmarks

- **C++ Engine**: ~50,000 ops/sec
- **JavaScript Engine**: ~15,000 ops/sec
- **Memory Usage**: <100MB typical
- **Startup Time**: <2 seconds

### Optimisation Tips

1. Use C++ engine for production workloads
2. Configure appropriate `NODE_OPTIONS` for memory
3. Enable connection pooling for high-traffic scenarios
4. Monitor via Prometheus metrics

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Ensure linting passes
5. Submit a pull request

### Development Standards

- Follow NZ English spelling conventions
- Include comprehensive tests
- Document public APIs
- Maintain backwards compatibility

## Troubleshooting

### Common Issues

**Native addon build fails:**
```bash
# Install build tools
npm install -g node-gyp
# Rebuild
npm run build:native
```

**Permission errors:**
```bash
# Check file permissions
ls -la packages/
# Fix if needed
chmod -R 755 packages/
```

**Port conflicts:**
```bash
# Change port in .env
MNEMONIC_PORT=8082
```

### Support

- **Issues**: https://github.com/dupesnduds/mnemonic/issues
- **Documentation**: https://github.com/dupesnduds/mnemonic/wiki
- **Performance**: Check monitoring dashboards first

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Changelog

### v2.0.0
- Monorepo reorganisation
- C++ native addon integration
- Enhanced security features
- Comprehensive monitoring
- NZ English conventions
