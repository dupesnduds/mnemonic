# Memory Efficiency Alert Runbook

## Alert: MemoryEfficiencyWarning / MemoryEfficiencyCritical

**Service**: Brains Memory System  
**SLO**: Memory lookup efficiency ≥ 90%  
**Alert Threshold**: Warning < 92%, Critical < 90%

## Overview

This runbook provides step-by-step instructions for resolving memory efficiency degradation in the Brains Memory System. Memory efficiency measures the percentage of lookup requests that successfully return a cached solution.

## Alert Details

- **Warning**: `(rate(memory_lookup_hits_total[5m]) / rate(memory_lookup_requests_total[5m])) * 100 < 92`
- **Critical**: `(rate(memory_lookup_hits_total[5m]) / rate(memory_lookup_requests_total[5m])) * 100 < 90`
- **Emergency**: `< 85%` (SLA violation risk)

## Initial Response (First 5 minutes)

### 1. Acknowledge the Alert
- [ ] Acknowledge in PagerDuty/Slack
- [ ] Check if this is part of a known maintenance window
- [ ] Verify alert is not a false positive

### 2. Quick Health Assessment
```bash
# Check service status
curl http://localhost:8081/health

# Check current efficiency
curl http://localhost:8081/metrics | grep memory_lookup_hits_total
curl http://localhost:8081/metrics | grep memory_lookup_requests_total
```

### 3. Check Dashboard
- Open [Memory Efficiency Dashboard](http://localhost:3000/d/brains-memory-dashboard)
- Look for patterns in efficiency drop
- Check error rate trends
- Examine request volume changes

## Investigation Steps

### 4. Examine Recent Changes
- [ ] Check recent deployments or configuration changes
- [ ] Review recent commits to memory categories or solution data
- [ ] Look for infrastructure changes (disk, memory, network)

### 5. Analyze Traces
```bash
# Check recent traces for failed lookups
# Open Jaeger UI: http://localhost:16686
# Search for service: brains-memory-mcp
# Filter by: error=true or status_code!=200
```

### 6. Log Analysis
```bash
# Check for errors in MCP logs
tail -100 mcp.log | grep ERROR

# Look for trace patterns
tail -100 mcp.log | grep "No solution found"

# Check for file loading issues
tail -100 mcp.log | grep "Error loading memory data"
```

### 7. Memory File Validation
```bash
# Validate YAML structure
python -c "import yaml; yaml.safe_load(open('structured_memory.yaml'))"
python -c "import yaml; yaml.safe_load(open('global_structured_memory.yaml'))"

# Check file permissions and accessibility
ls -la structured_memory.yaml global_structured_memory.yaml

# Verify backup availability
ls -la backups/
```

## Common Root Causes & Solutions

### Corrupted Memory Files
**Symptoms**: High miss rate, file loading errors in logs
```bash
# Check file integrity
file structured_memory.yaml
wc -l structured_memory.yaml

# Restore from backup if needed
cp backups/structured_memory_$(date +%Y%m%d)*.yaml structured_memory.yaml

# Restart service
sudo systemctl restart brains-memory
```

### Empty or Sparse Memory
**Symptoms**: Low solution count, specific categories affected
```bash
# Check solution counts by category
curl http://localhost:8081/stats

# Review error categories with no solutions
python update_memory.py --list-categories
```

### Request Pattern Changes
**Symptoms**: New error types, categories not in existing memory
```bash
# Analyze recent request patterns
grep "Memory lookup request" mcp.log | tail -50

# Check for new error categories
curl http://localhost:8081/metrics | grep memory_lookup_requests_total
```

### Performance Issues
**Symptoms**: Timeouts, slow responses, high latency
```bash
# Check system resources
top
df -h
free -m

# Check response times
curl -w "%{time_total}" http://localhost:8081/health
```

## Resolution Actions

### Immediate Actions (Critical alert)

1. **Restart Service** (if logs show errors):
```bash
sudo systemctl restart brains-memory
# Wait 30 seconds
curl http://localhost:8081/health
```

2. **Restore from Backup** (if file corruption detected):
```bash
# Find latest backup
ls -lt backups/ | head -5
# Restore
cp backups/structured_memory_YYYYMMDD_HHMMSS.yaml structured_memory.yaml
sudo systemctl restart brains-memory
```

3. **Clear Cache/Restart** (if memory issues):
```bash
# Restart with fresh memory state
sudo systemctl stop brains-memory
sleep 5
sudo systemctl start brains-memory
```

### Medium-term Actions (Warning alert)

1. **Update Memory Data**:
```bash
# Add missing solutions for common errors
python update_memory.py "new common error" "category" "solution description"
```

2. **Optimize Memory Structure**:
```bash
# Run consistency checker
python check_memory.py

# Clean up duplicates or old entries
python check_memory.py --cleanup
```

## Escalation

### Escalate if:
- Alert persists after 15 minutes of troubleshooting
- Multiple services affected
- Unable to identify root cause
- System completely unresponsive

### Escalation Contacts:
- **Engineering Lead**: @eng-lead (Slack)
- **On-call Engineer**: PagerDuty escalation
- **Platform Team**: @platform-team (for infrastructure issues)

## Post-Incident

### 1. Verify Resolution
- [ ] Efficiency back above 90% for 10+ minutes
- [ ] No related errors in logs
- [ ] Dashboard shows normal patterns

### 2. Document Findings
- [ ] Update this runbook if new scenarios discovered
- [ ] Log incident in incident tracking system
- [ ] Schedule post-mortem if needed

### 3. Preventive Actions
- [ ] Update monitoring if gaps identified
- [ ] Improve alerting thresholds if needed
- [ ] Add new test cases to chaos testing

## Related Runbooks
- [Response Latency Alert](response-latency-alert.md)
- [Service Availability Alert](service-availability-alert.md)
- [Error Rate Alert](error-rate-alert.md)

## Useful Commands Reference

```bash
# Quick efficiency check
curl -s http://localhost:8081/metrics | grep -E "(memory_lookup_hits_total|memory_lookup_requests_total)"

# Recent error analysis
grep "No solution found" mcp.log | tail -20

# File validation
python -c "import yaml; print('Valid YAML') if yaml.safe_load(open('structured_memory.yaml')) else print('Invalid')"

# Service restart
sudo systemctl restart brains-memory && sleep 5 && curl http://localhost:8081/health

# Emergency backup restore
cp backups/$(ls -t backups/ | head -1) structured_memory.yaml
```

---

**Last Updated**: {{current_date}}  
**Version**: 1.0  
**Contact**: @brains-memory-team