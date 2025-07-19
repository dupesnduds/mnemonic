# Brains Memory System - Team Training Guide

This guide provides comprehensive training materials for team members working with the Brains Memory System in production environments.

## 🎯 Learning Objectives

By completing this training, team members will be able to:
- Understand the Brains Memory System architecture and components
- Monitor system health using observability tools
- Respond to alerts and incidents effectively
- Perform routine maintenance and troubleshooting
- Implement security best practices
- Optimize system performance and costs

## 📚 Training Modules

### Module 1: System Overview (30 minutes)

#### Architecture Components
- **MCP Server**: Core service providing memory lookup API
- **Memory Engine**: C++ native addon with JavaScript fallback
- **Observability Stack**: Prometheus, Jaeger, Grafana
- **Security Layer**: API authentication, rate limiting, PII sanitization

#### Key Concepts
```bash
# Start your learning environment
./observability-setup.sh
npm start

# Explore the system
curl http://localhost:8081/health
curl -H "X-API-Key: demo-key" http://localhost:8081/metrics
```

#### Learning Exercise
1. Review the architecture diagram in README.md
2. Start the system and verify all components are running
3. Make a test API call and trace it through Jaeger

---

### Module 2: Monitoring & Observability (45 minutes)

#### Dashboard Navigation
- **Grafana**: http://localhost:3000 (admin/admin)
- **Prometheus**: http://localhost:9090
- **Jaeger**: http://localhost:16686

#### Key Metrics to Monitor
```promql
# Memory efficiency (target: ≥90%)
(rate(memory_lookup_hits_total[5m]) / rate(memory_lookup_requests_total[5m])) * 100

# Response latency (target: P95 ≤10ms)
histogram_quantile(0.95, rate(memory_file_load_duration_seconds_bucket[5m]))

# Service availability (target: ≥99.9%)
up{job="brains-memory"}

# Error rate (target: ≤1%)
(rate(memory_lookup_misses_total[5m]) / rate(memory_lookup_requests_total[5m])) * 100
```

#### Hands-on Exercise
```bash
# Generate load to see metrics
node load-testing.js --duration 60 --concurrency 10

# Watch metrics in real-time
watch -n 5 'curl -s -H "X-API-Key: demo-key" http://localhost:8081/metrics | grep memory_lookup'

# Explore traces in Jaeger UI
# Search for service: brains-memory-mcp
# Filter by duration > 10ms to find slow requests
```

#### Quiz Questions
1. What is the target SLO for memory efficiency?
2. Where would you look to debug a slow API request?
3. How do you check if the C++ engine is being used vs JavaScript fallback?

---

### Module 3: Alert Response (60 minutes)

#### Alert Categories
| Alert | Severity | Response Time | Action |
|-------|----------|---------------|---------|
| MemoryEfficiencyWarning | Warning | 15 min | Check recent changes, validate files |
| MemoryEfficiencyCritical | Critical | 5 min | Restart service, restore from backup |
| ResponseLatencyWarning | Warning | 10 min | Check resources, optimize files |
| ServiceAvailabilityCritical | Critical | 2 min | Immediate restart, escalate |

#### Incident Response Workflow
1. **Acknowledge** alert in monitoring system
2. **Assess** scope and impact using dashboards
3. **Investigate** using logs and traces
4. **Resolve** following runbook procedures
5. **Verify** resolution and monitor for recurrence
6. **Document** findings and update runbooks

#### Simulation Exercise
```bash
# Simulate memory efficiency degradation
# Corrupt a memory file temporarily
cp structured_memory.yaml structured_memory.yaml.backup
echo "invalid: yaml: content" > structured_memory.yaml

# Watch for alerts and practice response
# Follow the runbook: runbooks/memory-efficiency-alert.md

# Restore after exercise
mv structured_memory.yaml.backup structured_memory.yaml
sudo systemctl restart brains-memory
```

#### Practice Scenarios
1. **Scenario A**: Memory efficiency drops to 85%
   - Use runbook: `runbooks/memory-efficiency-alert.md`
   - Expected resolution time: 10 minutes

2. **Scenario B**: Response latency spikes to 50ms
   - Use runbook: `runbooks/response-latency-alert.md`
   - Check system resources and file sizes

3. **Scenario C**: Service becomes unresponsive
   - Use runbook: `runbooks/service-availability-alert.md`
   - Practice emergency restart procedures

---

### Module 4: Security Operations (30 minutes)

#### Security Features
- **API Key Authentication**: Required for /metrics and /stats endpoints
- **Rate Limiting**: 100 requests/minute per client by default
- **PII Sanitization**: Automatic removal from logs and traces
- **Audit Logging**: All API access logged to security-audit.log

#### Security Monitoring
```bash
# Check for unauthorized access
grep "403\|401" security-audit.log

# Monitor rate limiting
grep "Rate limit exceeded" security-audit.log

# Review API key usage
grep "metrics_access" security-audit.log | tail -20
```

#### Security Incident Response
```bash
# Emergency API key rotation
openssl rand -hex 32 > new-api-key.txt
# Update .env file with new key
# Restart service: sudo systemctl restart brains-memory
# Notify team of new API key
```

#### Best Practices Checklist
- [ ] API keys rotated monthly
- [ ] Firewall rules restrict metrics endpoints
- [ ] HTTPS used for all external access
- [ ] Security audit logs reviewed weekly
- [ ] PII sanitization verified in traces

---

### Module 5: Performance Optimization (45 minutes)

#### Performance Monitoring
```bash
# Check current performance metrics
curl -s -H "X-API-Key: demo-key" http://localhost:8081/stats | jq .

# Run performance benchmarks
npm run benchmark

# Analyze cost optimization
node cost-optimization.js
```

#### Optimization Techniques
1. **Memory File Optimization**
   ```bash
   # Check file sizes
   ls -lh *.yaml
   
   # Run consistency checker and optimizer
   python check_memory.py --optimize
   ```

2. **Sampling Rate Optimization**
   ```bash
   # Current sampling rate
   echo $OTEL_SAMPLING_RATE
   
   # Optimize for cost
   node cost-optimization.js --optimize
   ```

3. **System Resource Tuning**
   ```bash
   # Check resource usage
   htop
   iostat -x 1 5
   
   # Optimize Node.js heap
   export NODE_OPTIONS="--max-old-space-size=2048"
   ```

#### Performance Testing
```bash
# Run chaos testing
./chaos-testing.sh

# Run load testing with different parameters
node load-testing.js --duration 300 --concurrency 50

# Analyze results and identify bottlenecks
```

---

### Module 6: Maintenance Operations (30 minutes)

#### Regular Maintenance Tasks

**Daily:**
```bash
# Check service health
curl http://localhost:8081/health

# Review dashboard for any anomalies
# Check error rates and response times
```

**Weekly:**
```bash
# Run system validation
./validate_deployment.sh

# Clean up old data
node cost-optimization.js --cleanup

# Review security audit logs
tail -100 security-audit.log
```

**Monthly:**
```bash
# Update dependencies
npm update
pip install -r requirements.txt --upgrade

# Rotate API keys
./scripts/rotate-api-keys.sh

# Review and update SLO thresholds
```

#### Backup and Recovery
```bash
# Manual backup
cp structured_memory.yaml backups/manual-backup-$(date +%Y%m%d).yaml

# Test recovery procedure
cp backups/structured_memory_20240101_120000.yaml structured_memory.yaml
sudo systemctl restart brains-memory
```

---

## 🏆 Certification Checklist

To be certified on the Brains Memory System, complete the following:

### Knowledge Check
- [ ] Can explain system architecture and components
- [ ] Understands SLI/SLO definitions and targets
- [ ] Familiar with all monitoring dashboards
- [ ] Knows location of all runbooks

### Practical Skills
- [ ] Successfully responded to simulated memory efficiency alert
- [ ] Demonstrated proper incident escalation procedure
- [ ] Performed API key rotation
- [ ] Executed system backup and recovery
- [ ] Used cost optimization tools effectively

### Emergency Procedures
- [ ] Can restart service under pressure
- [ ] Knows emergency contacts and escalation paths
- [ ] Understands security incident response
- [ ] Can perform manual failover if needed

## 📖 Reference Materials

### Quick Reference Commands
```bash
# Health check
curl http://localhost:8081/health

# Restart service
sudo systemctl restart brains-memory

# Check logs
tail -f mcp.log
sudo journalctl -u brains-memory -f

# Emergency backup
cp structured_memory.yaml emergency-backup-$(date +%Y%m%d-%H%M).yaml

# API key check
curl -H "X-API-Key: your-key" http://localhost:8081/metrics | head -5
```

### Emergency Contacts
- **Engineering Lead**: @eng-lead
- **On-Call Engineer**: PagerDuty escalation
- **Infrastructure Team**: @infra-team
- **Security Team**: @security-team

### Documentation Links
- [Production Deployment Guide](production-deployment-guide.md)
- [Runbooks Directory](../runbooks/)
- [SLI/SLO Definitions](../sli-slo-sla.yml)
- [Cost Optimization Guide](../cost-optimization.js)

## 🎓 Advanced Topics

### Custom Metrics Development
```javascript
// Adding new metrics to lib/prometheus_metrics.js
const customMetric = new client.Counter({
  name: 'custom_operations_total',
  help: 'Total custom operations',
  labelNames: ['operation_type']
});
```

### Advanced Tracing
```javascript
// Adding custom spans
const { tracer } = require('./tracing-secure');
tracer.startActiveSpan('custom-operation', (span) => {
  // Your operation here
  span.setAttributes({ 'custom.attribute': 'value' });
  span.end();
});
```

### Custom Alert Rules
```yaml
# Adding to alert_rules.yml
- alert: CustomMetricAlert
  expr: custom_operations_total > 1000
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "High custom operations rate"
```

## 📝 Training Record

**Trainee**: _______________  
**Trainer**: _______________  
**Date**: _______________  

### Module Completion
- [ ] Module 1: System Overview
- [ ] Module 2: Monitoring & Observability  
- [ ] Module 3: Alert Response
- [ ] Module 4: Security Operations
- [ ] Module 5: Performance Optimization
- [ ] Module 6: Maintenance Operations

### Certification Status
- [ ] Knowledge Check Passed
- [ ] Practical Skills Demonstrated
- [ ] Emergency Procedures Validated
- [ ] **CERTIFIED** ✅

**Trainer Signature**: _______________  
**Date**: _______________

---

**Next Training Review**: 6 months from certification date  
**Refresher Required**: Annually or after major system changes

For training support or questions, contact: @brains-memory-team