# Response Latency Alert Runbook

## Alert: ResponseLatencyWarning / ResponseLatencyCritical

**Service**: Brains Memory System  
**SLO**: P95 response latency ≤ 10ms  
**Alert Threshold**: Warning > 8ms, Critical > 10ms

## Overview

This runbook addresses high response latency in the Brains Memory System. Response latency measures the time taken for memory file operations and request processing.

## Alert Details

- **Warning**: `histogram_quantile(0.95, sum(rate(memory_file_load_duration_seconds_bucket[5m])) by (le)) > 0.008`
- **Critical**: `histogram_quantile(0.95, sum(rate(memory_file_load_duration_seconds_bucket[5m])) by (le)) > 0.01`
- **Emergency**: `> 50ms` (SLA violation risk)

## Initial Response (First 5 minutes)

### 1. Acknowledge and Assess
- [ ] Acknowledge the alert
- [ ] Check if this affects user-facing services
- [ ] Verify current latency metrics

### 2. Quick Latency Check
```bash
# Test current response time
time curl -X POST -H "Content-Type: application/json" \
  -d '{"problem":"test latency"}' http://localhost:8081/

# Check metrics endpoint response time
time curl http://localhost:8081/metrics

# Health check response time
time curl http://localhost:8081/health
```

### 3. System Resource Check
```bash
# CPU and memory usage
top -n 1
free -m
df -h

# I/O wait and disk usage
iostat 1 5
```

## Investigation Steps

### 4. Analyze Latency Patterns
- Open [Latency Dashboard](http://localhost:3000/d/brains-memory-dashboard)
- Check P50, P90, P95, P99 latencies
- Look for correlations with request volume
- Examine latency by operation type

### 5. Trace Analysis
```bash
# Find slow traces in Jaeger
# Open: http://localhost:16686
# Filter by: duration > 10ms
# Look for slow spans in traces
```

### 6. Log Analysis for Performance Issues
```bash
# Check for slow operations
grep "operation.duration" mcp.log | tail -20

# Look for file loading timeouts
grep -E "(timeout|slow|delay)" mcp.log

# Check for backup recovery events (slower than normal reads)
grep "backup recovery" mcp.log
```

### 7. Memory File Analysis
```bash
# Check file sizes (large files = slower loading)
ls -lh structured_memory.yaml global_structured_memory.yaml

# Count solutions (more solutions = potential slower lookups)
curl http://localhost:8081/stats | jq .

# Check for very large individual solutions
grep -c "solution:" structured_memory.yaml
```

## Common Root Causes & Solutions

### Large Memory Files
**Symptoms**: Consistent high latency, file loading delays
```bash
# Check file sizes
du -h *.yaml

# If files are very large (>10MB), consider archiving old solutions
python check_memory.py --archive-old --days 180
```

### Disk I/O Issues
**Symptoms**: Variable latency, high I/O wait
```bash
# Check disk performance
iostat -x 1 5

# Check disk space
df -h

# Look for disk errors
dmesg | grep -i "disk\|i/o\|error"
```

### Memory Pressure
**Symptoms**: Increasing latency over time, system swapping
```bash
# Check memory usage
free -m
cat /proc/meminfo | grep -E "(MemFree|MemAvailable|SwapUsed)"

# Check for memory leaks in the process
ps aux | grep node
pmap $(pgrep -f memory-mcp.js)
```

### C++ Engine Performance
**Symptoms**: Sudden latency increase, engine fallback logs
```bash
# Check if using JavaScript fallback
curl http://localhost:8081/metrics | grep memory_engine_type

# Check for C++ engine errors
grep -E "(C\+\+|engine|addon)" mcp.log
```

### Network Issues
**Symptoms**: Variable latency, timeout errors
```bash
# Check network latency to localhost
ping -c 5 localhost

# Check if other services on same port range are affected
netstat -tulpn | grep 808[0-9]
```

## Resolution Actions

### Immediate Actions (Critical alert)

1. **Restart Service** (clears memory, reloads files):
```bash
sudo systemctl restart brains-memory
sleep 10
# Test latency
time curl http://localhost:8081/health
```

2. **Clear File System Cache** (if disk I/O suspected):
```bash
# Warning: This affects entire system
sudo sync && sudo echo 3 > /proc/sys/vm/drop_caches
```

3. **Reduce Memory File Size** (emergency):
```bash
# Backup current files
cp structured_memory.yaml structured_memory.backup
cp global_structured_memory.yaml global_structured_memory.backup

# Remove old entries (emergency only)
python check_memory.py --emergency-cleanup --keep-recent 100
sudo systemctl restart brains-memory
```

### Medium-term Actions (Warning alert)

1. **Optimize Memory Files**:
```bash
# Run consistency checker and optimizer
python check_memory.py --optimize

# Archive old solutions
python check_memory.py --archive-old --days 90
```

2. **Monitor Resource Usage**:
```bash
# Set up resource monitoring
watch -n 5 'free -m; echo "---"; iostat -x 1 1'
```

3. **Rebuild Native Addon** (if performance degraded):
```bash
cd native
npm run rebuild
cd ..
sudo systemctl restart brains-memory
```

## Performance Optimization

### File Optimization
```bash
# Compress old backups
gzip backups/*.yaml

# Clean up temporary files
find . -name "*.tmp" -delete

# Optimize YAML structure
python check_memory.py --defragment
```

### System Tuning
```bash
# Increase file descriptor limits (if needed)
ulimit -n 65536

# Optimize Node.js performance
export NODE_OPTIONS="--max-old-space-size=2048"
sudo systemctl restart brains-memory
```

## Escalation

### Escalate if:
- Latency > 50ms for more than 5 minutes
- System resources completely exhausted
- Unable to restart service
- Multiple alerts firing simultaneously

### Escalation Contacts:
- **Performance Team**: @perf-team (Slack)
- **Infrastructure Team**: @infra-team (for system-level issues)
- **Engineering Lead**: @eng-lead

## Post-Incident

### 1. Verify Resolution
- [ ] P95 latency back below 10ms for 15+ minutes
- [ ] No resource exhaustion
- [ ] Normal request processing patterns

### 2. Performance Analysis
- [ ] Identify what caused the latency spike
- [ ] Review trends leading up to the incident
- [ ] Check if preventable with better monitoring

### 3. Improvements
- [ ] Update file optimization schedule if needed
- [ ] Adjust alert thresholds based on findings
- [ ] Add performance tests to CI if patterns identified

## Related Runbooks
- [Memory Efficiency Alert](memory-efficiency-alert.md)
- [Service Availability Alert](service-availability-alert.md)
- [Error Budget Alert](error-budget-alert.md)

## Performance Benchmarks

### Expected Latencies
- **Health check**: < 1ms
- **Simple memory lookup**: < 5ms
- **Complex conflict resolution**: < 10ms
- **File loading**: < 20ms (cold start)

### Warning Thresholds
- **P50**: > 5ms
- **P90**: > 8ms
- **P95**: > 10ms
- **P99**: > 20ms

## Useful Commands Reference

```bash
# Latency testing
time curl -X POST -H "Content-Type: application/json" -d '{"problem":"test"}' http://localhost:8081/

# Current latency metrics
curl -s http://localhost:8081/metrics | grep memory_file_load_duration_seconds

# Resource monitoring
htop
iotop
netstat -i

# File optimization
python check_memory.py --stats
du -sh *.yaml backups/

# Service management
sudo systemctl status brains-memory
sudo journalctl -u brains-memory -f
```

---

**Last Updated**: {{current_date}}  
**Version**: 1.0  
**Contact**: @brains-memory-team