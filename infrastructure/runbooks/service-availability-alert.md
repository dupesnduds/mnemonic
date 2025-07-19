# Service Availability Alert Runbook

## Alert: ServiceAvailabilityWarning / ServiceAvailabilityCritical

**Service**: Brains Memory System  
**SLO**: Service availability ≥ 99.9%  
**Alert Threshold**: Warning < 99.95%, Critical = Service Down

## Overview

This runbook addresses service availability issues in the Brains Memory System. Service availability measures whether the system is up and responding to requests.

## Alert Details

- **Warning**: `avg_over_time(up{job="brains-memory"}[5m]) < 0.9995`
- **Critical**: `up{job="brains-memory"} == 0`
- **Emergency**: Extended downtime approaching SLA threshold

## Initial Response (First 2 minutes)

### 1. Immediate Assessment
- [ ] Acknowledge the alert immediately
- [ ] Check if this is a planned maintenance window
- [ ] Verify alert is not a monitoring system issue

### 2. Quick Service Check
```bash
# Direct connectivity test
curl -m 5 http://localhost:8081/health

# Process check
ps aux | grep memory-mcp.js
sudo systemctl status brains-memory

# Port availability
netstat -tulpn | grep 8081
lsof -i :8081
```

### 3. System Status
```bash
# Overall system health
uptime
df -h
free -m

# Check for system-wide issues
dmesg | tail -20
sudo journalctl -n 50 --no-pager
```

## Investigation Steps

### 4. Service Logs Analysis
```bash
# Recent service logs
sudo journalctl -u brains-memory -n 100 --no-pager

# Application logs
tail -50 mcp.log
grep ERROR mcp.log | tail -10

# System error logs
grep -i error /var/log/syslog | tail -10
```

### 5. Process and Resource Investigation
```bash
# Check if process is running
pgrep -f memory-mcp.js

# Resource usage of the process
ps aux | grep memory-mcp.js
top -p $(pgrep memory-mcp.js)

# Check for core dumps
ls -la core.* /tmp/core.* 2>/dev/null || echo "No core dumps found"
```

### 6. Network and Port Issues
```bash
# Port binding issues
ss -tulpn | grep 8081

# Network connectivity
ping -c 3 localhost
curl -v http://localhost:8081/health

# Firewall issues
sudo iptables -L | grep 8081
```

### 7. Dependency Check
```bash
# Check required files
ls -la structured_memory.yaml global_structured_memory.yaml error_categories.yaml

# Node.js version and availability
node --version
which node

# Required modules
cd /path/to/brains && npm list --depth=0
```

## Common Root Causes & Solutions

### Process Crashed
**Symptoms**: No process running, exit codes in logs
```bash
# Check crash reason
sudo journalctl -u brains-memory -n 20 --no-pager | grep -E "(error|failed|crash|exit)"

# Check for uncaught exceptions
grep -E "(uncaught|exception|error)" mcp.log | tail -5

# Restart service
sudo systemctl start brains-memory
sleep 5
curl http://localhost:8081/health
```

### Port Conflict
**Symptoms**: "Port already in use" errors
```bash
# Find what's using the port
sudo lsof -i :8081
sudo netstat -tulpn | grep 8081

# Kill conflicting process (if safe)
sudo kill $(sudo lsof -t -i:8081)

# Start service
sudo systemctl start brains-memory
```

### File Permission Issues
**Symptoms**: Permission denied errors in logs
```bash
# Check file permissions
ls -la structured_memory.yaml global_structured_memory.yaml
ls -la mcp.log

# Fix permissions if needed
sudo chown $(whoami):$(whoami) *.yaml mcp.log
chmod 644 *.yaml
chmod 644 mcp.log
```

### Out of Memory/Disk Space
**Symptoms**: System resource exhaustion
```bash
# Check disk space
df -h
# If disk full, clean up logs
sudo journalctl --vacuum-time=7d

# Check memory
free -m
# If out of memory, restart service
sudo systemctl restart brains-memory
```

### Dependency Issues
**Symptoms**: Module loading errors, import failures
```bash
# Reinstall dependencies
npm ci
sudo systemctl restart brains-memory

# Check Node.js version compatibility
node --version
npm --version
```

## Resolution Actions

### Critical Response (Service Down)

1. **Immediate Service Restart**:
```bash
# Force restart
sudo systemctl stop brains-memory
sleep 3
sudo systemctl start brains-memory

# Verify startup
sleep 10
curl http://localhost:8081/health
sudo systemctl status brains-memory
```

2. **Emergency Fallback** (if restart fails):
```bash
# Manual startup for debugging
cd /path/to/brains
node memory-mcp.js

# If that fails, check basic functionality
node -e "console.log('Node.js working')"
```

3. **Quick Recovery Actions**:
```bash
# Reset to known good state
git checkout HEAD~1  # If recent changes suspected
npm ci
sudo systemctl restart brains-memory

# Restore from backup if file corruption
cp backups/structured_memory_$(date +%Y%m%d)*.yaml structured_memory.yaml
sudo systemctl restart brains-memory
```

### Service Recovery Verification

```bash
# Comprehensive health check
curl http://localhost:8081/health
curl http://localhost:8081/stats
curl http://localhost:8081/metrics

# Test basic functionality
curl -X POST -H "Content-Type: application/json" \
  -d '{"problem":"test recovery"}' http://localhost:8081/

# Check observability
grep "trace:" mcp.log | tail -1
```

## Advanced Troubleshooting

### Deep Diagnostics
```bash
# System call tracing (if service keeps failing)
sudo strace -f -p $(pgrep memory-mcp.js) 2>&1 | head -50

# Memory analysis
sudo pmap $(pgrep memory-mcp.js)
cat /proc/$(pgrep memory-mcp.js)/status

# File descriptor usage
sudo lsof -p $(pgrep memory-mcp.js) | wc -l
ulimit -n
```

### Container/Docker Issues (if applicable)
```bash
# Container status
docker ps | grep brains
docker logs --tail 50 <container_id>

# Container restart
docker restart <container_id>
```

## Escalation

### Immediate Escalation Triggers:
- Service down for > 5 minutes
- Unable to restart service
- System-wide infrastructure issues
- Multiple related services affected

### Escalation Process:
1. **Level 1**: Page on-call engineer via PagerDuty
2. **Level 2**: Escalate to Engineering Lead if unresolved in 10 minutes
3. **Level 3**: Escalate to Infrastructure team for system issues
4. **Level 4**: Emergency management for extended outages

### Escalation Contacts:
- **On-call Engineer**: PagerDuty auto-escalation
- **Engineering Lead**: @eng-lead (Slack)
- **Infrastructure Team**: @infra-team
- **Incident Commander**: @incident-commander (major outages)

## Communication

### Status Updates:
- **Every 10 minutes** during outage
- **All stakeholders** via status page
- **#incidents** Slack channel

### Templates:
```
🚨 INVESTIGATING: Brains Memory System experiencing availability issues. 
Time: [TIME]
Impact: [DESCRIPTION]
ETA: [TIMELINE]
Updates: Every 10 minutes
```

## Post-Incident

### 1. Service Verification (Allow 15 minutes)
- [ ] Service responding normally
- [ ] All health checks passing
- [ ] Metrics collection resumed
- [ ] No error patterns in logs

### 2. Impact Assessment
- [ ] Calculate actual downtime
- [ ] Determine SLA impact
- [ ] Identify affected users/services
- [ ] Document timeline of events

### 3. Root Cause Analysis
- [ ] Preserve logs and forensic data
- [ ] Identify immediate trigger
- [ ] Analyze contributing factors
- [ ] Document lessons learned

### 4. Follow-up Actions
- [ ] Schedule post-mortem meeting
- [ ] Update monitoring if gaps found
- [ ] Implement preventive measures
- [ ] Update this runbook with new insights

## Prevention

### Monitoring Improvements
```bash
# Add more granular health checks
curl http://localhost:8081/health | jq .memory_files

# Monitor process health
ps aux | grep memory-mcp.js | grep -v grep || echo "ALERT: Process down"
```

### Automated Recovery
```bash
# Add systemd restart on failure
sudo systemctl edit brains-memory
# Add:
# [Service]
# Restart=always
# RestartSec=10
```

## Related Runbooks
- [Memory Efficiency Alert](memory-efficiency-alert.md)
- [Response Latency Alert](response-latency-alert.md)
- [Infrastructure Issues](infrastructure-issues.md)

## Useful Commands Reference

```bash
# Service management
sudo systemctl status brains-memory
sudo systemctl start brains-memory
sudo systemctl restart brains-memory
sudo systemctl stop brains-memory

# Health checks
curl -f http://localhost:8081/health
curl -f http://localhost:8081/metrics

# Process management
ps aux | grep memory-mcp.js
kill -9 $(pgrep memory-mcp.js)
nohup node memory-mcp.js &

# Log analysis
tail -f mcp.log
sudo journalctl -u brains-memory -f
grep ERROR mcp.log

# Resource checks
free -m
df -h
netstat -tulpn | grep 8081
```

---

**Last Updated**: {{current_date}}  
**Version**: 1.0  
**Contact**: @brains-memory-team  
**Emergency Contact**: +1-XXX-XXX-XXXX