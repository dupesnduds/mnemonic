#!/bin/bash

# Brains Memory System - Observability Stack Setup Script

set -e

echo "🧠 Setting up Brains Memory System Observability Stack..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Error: docker-compose is not installed. Please install docker-compose and try again."
    exit 1
fi

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm install

# Start the observability stack
echo "🚀 Starting Jaeger, Prometheus, and Grafana..."
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 10

# Check service health
echo "🔍 Checking service health..."

# Check Jaeger
if curl -f http://localhost:16686/api/services > /dev/null 2>&1; then
    echo "✅ Jaeger is running at http://localhost:16686"
else
    echo "⚠️  Jaeger may not be ready yet. Check http://localhost:16686 in a moment."
fi

# Check Prometheus
if curl -f http://localhost:9090/-/healthy > /dev/null 2>&1; then
    echo "✅ Prometheus is running at http://localhost:9090"
else
    echo "⚠️  Prometheus may not be ready yet. Check http://localhost:9090 in a moment."
fi

# Check Grafana
if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "✅ Grafana is running at http://localhost:3000 (admin/admin)"
else
    echo "⚠️  Grafana may not be ready yet. Check http://localhost:3000 in a moment."
fi

echo ""
echo "🎉 Observability stack setup complete!"
echo ""
echo "Next steps:"
echo "1. Start the Brains Memory System: npm start"
echo "2. Open Grafana at http://localhost:3000 (admin/admin)"
echo "3. Import the dashboard from grafana_dashboard.json"
echo "4. View traces at http://localhost:16686"
echo "5. Check metrics at http://localhost:9090"
echo ""
echo "To stop the observability stack: docker-compose down"