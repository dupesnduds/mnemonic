# Brains Memory System - Production Deployment Guide

This comprehensive guide covers deploying the Brains Memory System in production environments with full observability, security, and reliability features.

## 📋 Pre-Deployment Checklist

### System Requirements
- [ ] **Node.js**: Version 18 or higher
- [ ] **Python**: Version 3.8 or higher  
- [ ] **Memory**: Minimum 2GB RAM
- [ ] **Storage**: 10GB available space
- [ ] **Network**: Ports 8081 (service), 9090 (Prometheus), 16686 (Jaeger), 3000 (Grafana)

### Security Requirements
- [ ] **API Keys**: Generate secure API keys for metrics access
- [ ] **Firewall**: Configure appropriate firewall rules
- [ ] **SSL/TLS**: Set up reverse proxy with SSL termination
- [ ] **User Access**: Restrict system user permissions

### Monitoring Requirements
- [ ] **Observability Stack**: Prometheus, Jaeger, Grafana deployed
- [ ] **Alerting**: PagerDuty or similar alerting system configured
- [ ] **Log Management**: Centralized logging solution (optional)

## 🚀 Deployment Steps

### 1. Environment Preparation

```bash
# Create application user
sudo useradd -r -s /bin/false brains-memory
sudo mkdir -p /opt/brains-memory
sudo chown brains-memory:brains-memory /opt/brains-memory

# Clone and prepare application
cd /opt/brains-memory
git clone <repository-url> .
sudo chown -R brains-memory:brains-memory .
```

### 2. Dependency Installation

```bash
# Install Node.js dependencies
npm ci --production

# Install Python dependencies
pip install -r requirements.txt

# Build native addon (optional, has JavaScript fallback)
npm run build-addon || echo "Using JavaScript fallback"
```

### 3. Configuration Setup

```bash
# Copy and configure environment file
cp .env.example .env

# Generate secure API keys
openssl rand -hex 32 > api-key-1.txt
openssl rand -hex 32 > api-key-2.txt

# Edit .env file with production values
nano .env
```

**Critical .env configuration:**
```bash
# Security
BRAINS_ENABLE_AUTH=true
BRAINS_API_KEYS=$(cat api-key-1.txt),$(cat api-key-2.txt)
BRAINS_RATE_LIMIT=100

# Performance
NODE_ENV=production
MEMORY_ENGINE_TYPE=C++
NODE_OPTIONS=--max-old-space-size=2048

# Observability
OTEL_SAMPLING_RATE=0.1
JAEGER_ENDPOINT=http://localhost:14268/api/traces
```

### 4. Service Configuration

Create systemd service file:

```bash
sudo tee /etc/systemd/system/brains-memory.service << EOF
[Unit]
Description=Brains Memory System
After=network.target

[Service]
Type=simple
User=brains-memory
Group=brains-memory
WorkingDirectory=/opt/brains-memory
EnvironmentFile=/opt/brains-memory/.env
ExecStart=/usr/bin/node memory-mcp.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Security settings
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/opt/brains-memory

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
sudo systemctl enable brains-memory
sudo systemctl start brains-memory
sudo systemctl status brains-memory
```

### 5. Observability Stack Deployment

```bash
# Start observability stack
docker-compose up -d

# Wait for services to be ready
./observability-setup.sh

# Import Grafana dashboard
curl -X POST http://admin:admin@localhost:3000/api/dashboards/db \
  -H "Content-Type: application/json" \
  -d @grafana_dashboard.json
```

### 6. Security Hardening

```bash
# Set proper file permissions
chmod 600 .env
chmod 600 api-key-*.txt
chmod 644 *.yaml
chmod 755 *.sh

# Configure firewall (example for ufw)
sudo ufw allow from <monitoring-server-ip> to any port 8081
sudo ufw allow from <admin-network> to any port 3000,9090,16686
sudo ufw enable
```

### 7. Health Verification

```bash
# Test service health
curl http://localhost:8081/health

# Test metrics (with API key)
curl -H "X-API-Key: $(cat api-key-1.txt)" http://localhost:8081/metrics

# Test basic functionality
curl -X POST -H "Content-Type: application/json" \
  -d '{"problem":"production deployment test"}' \
  http://localhost:8081/

# Verify observability
curl http://localhost:9090/api/v1/query?query=up
curl http://localhost:16686/api/services
```

## 🔧 Configuration Reference

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BRAINS_ENABLE_AUTH` | `true` | Enable API key authentication |
| `BRAINS_API_KEYS` | - | Comma-separated API keys |
| `BRAINS_RATE_LIMIT` | `100` | Requests per minute per client |
| `NODE_ENV` | `development` | Environment (production/development) |
| `OTEL_SAMPLING_RATE` | `0.1` | OpenTelemetry sampling rate (0.0-1.0) |
| `MEMORY_ENGINE_TYPE` | `JavaScript` | Preferred engine (C++/JavaScript) |

### Service Configuration

**Recommended systemd overrides:**
```bash
sudo systemctl edit brains-memory
```

Add:
```ini
[Service]
# Increase restart attempts
StartLimitIntervalSec=300
StartLimitBurst=5

# Resource limits
MemoryLimit=2G
CPUQuota=200%

# Additional security
CapabilityBoundingSet=
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM
```

### Reverse Proxy Configuration

**Nginx example:**
```nginx
upstream brains-memory {
    server 127.0.0.1:8081;
}

server {
    listen 443 ssl http2;
    server_name brains-memory.yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://brains-memory;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Security headers
        add_header X-Content-Type-Options nosniff;
        add_header X-Frame-Options DENY;
        add_header X-XSS-Protection "1; mode=block";
    }
    
    # Restrict sensitive endpoints
    location ~ ^/(metrics|stats) {
        allow 10.0.0.0/8;
        allow 172.16.0.0/12;
        allow 192.168.0.0/16;
        deny all;
        
        proxy_pass http://brains-memory;
    }
}
```

## 📊 Monitoring & Alerting

### Prometheus Configuration

Update `prometheus.yml` for production:
```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "alert_rules.yml"

scrape_configs:
  - job_name: 'brains-memory'
    static_configs:
      - targets: ['localhost:8081']
    metrics_path: '/metrics'
    bearer_token: '<your-api-key>'
    scrape_interval: 15s
    scrape_timeout: 10s

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - localhost:9093  # Alertmanager
```

### Grafana Setup

1. **Access Grafana**: http://localhost:3000 (admin/admin)
2. **Add Prometheus datasource**: http://localhost:9090
3. **Import dashboard**: Use `grafana_dashboard.json`
4. **Configure notifications**: Set up Slack/email alerts

### Alert Manager Configuration

```yaml
# alertmanager.yml
global:
  smtp_smarthost: 'localhost:587'
  smtp_from: 'alerts@yourdomain.com'

route:
  group_by: ['alertname']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 1h
  receiver: 'web.hook'

receivers:
- name: 'web.hook'
  slack_configs:
  - api_url: '<slack-webhook-url>'
    channel: '#alerts'
    title: 'Brains Memory Alert'
```

## 🔐 Security Best Practices

### API Key Management
```bash
# Rotate API keys regularly
./scripts/rotate-api-keys.sh

# Monitor API key usage
grep "API key" security-audit.log | tail -100

# Revoke compromised keys
# Remove from BRAINS_API_KEYS and restart service
```

### Monitoring Security
```bash
# Check for unauthorized access attempts
grep "403\|401" security-audit.log

# Monitor rate limiting
grep "Rate limit exceeded" security-audit.log

# Review trace data for PII
# Traces automatically sanitized by PIISanitizationProcessor
```

### Data Protection
- **Encryption at rest**: Use encrypted filesystems
- **Network encryption**: Always use HTTPS/TLS
- **Backup encryption**: Encrypt backup files
- **Log sanitization**: Automatic PII removal enabled

## 🚨 Incident Response

### Emergency Procedures

1. **Service Down**:
   ```bash
   sudo systemctl restart brains-memory
   curl http://localhost:8081/health
   ```

2. **High Memory Usage**:
   ```bash
   sudo systemctl reload brains-memory
   node cost-optimization.js --cleanup
   ```

3. **Security Incident**:
   ```bash
   # Rotate API keys immediately
   openssl rand -hex 32 > new-api-key.txt
   # Update .env and restart
   ```

### Escalation Contacts
- **Engineering**: @eng-team
- **Infrastructure**: @infra-team  
- **Security**: @security-team
- **Management**: @managers

## 📈 Performance Tuning

### Memory Optimization
```bash
# Check memory usage
free -m
ps aux | grep memory-mcp.js

# Optimize Node.js heap
export NODE_OPTIONS="--max-old-space-size=2048 --optimize-for-size"
```

### File System Optimization
```bash
# Use SSD storage for better I/O
# Mount with noatime for better performance
sudo mount -o remount,noatime /opt/brains-memory

# Regular file system maintenance
sudo fstrim -v /opt/brains-memory
```

### Network Optimization
```bash
# Optimize TCP settings for high connections
echo 'net.core.somaxconn = 1024' >> /etc/sysctl.conf
echo 'net.ipv4.tcp_max_syn_backlog = 2048' >> /etc/sysctl.conf
sudo sysctl -p
```

## 🔄 Backup & Recovery

### Automated Backups
```bash
# Create backup script
cat > backup-brains-memory.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/backup/brains-memory/$(date +%Y%m%d)"
mkdir -p $BACKUP_DIR

# Backup configuration and data
cp /opt/brains-memory/*.yaml $BACKUP_DIR/
cp /opt/brains-memory/.env $BACKUP_DIR/
tar -czf $BACKUP_DIR/logs.tar.gz /opt/brains-memory/*.log

# Backup Prometheus data (if local)
cp -r /var/lib/prometheus $BACKUP_DIR/ 2>/dev/null || true

# Cleanup old backups (keep 30 days)
find /backup/brains-memory/ -type d -mtime +30 -exec rm -rf {} \;
EOF

chmod +x backup-brains-memory.sh

# Add to crontab
echo "0 2 * * * /opt/brains-memory/backup-brains-memory.sh" | crontab -
```

### Recovery Procedures
```bash
# Restore from backup
sudo systemctl stop brains-memory
cp backup/structured_memory.yaml /opt/brains-memory/
cp backup/.env /opt/brains-memory/
sudo systemctl start brains-memory
```

## 📚 Maintenance Schedule

### Daily
- [ ] Monitor service health via dashboard
- [ ] Check error rates and SLO compliance
- [ ] Review security audit logs

### Weekly  
- [ ] Run system health validation: `./validate_deployment.sh`
- [ ] Execute cleanup scripts: `node cost-optimization.js --cleanup`
- [ ] Review and rotate logs if needed

### Monthly
- [ ] Update dependencies: `npm update && pip install -r requirements.txt --upgrade`
- [ ] Review and update SLI/SLO thresholds
- [ ] Conduct disaster recovery testing
- [ ] Rotate API keys

### Quarterly
- [ ] Review and update security configurations
- [ ] Performance benchmarking and optimization
- [ ] Capacity planning review
- [ ] Update documentation and runbooks

---

**Document Version**: 1.0  
**Last Updated**: {{current_date}}  
**Next Review**: {{next_review_date}}

For support, contact: @brains-memory-team