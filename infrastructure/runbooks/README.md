# Brains Memory System - Incident Response Runbooks

This directory contains operational runbooks for the Brains Memory System. These runbooks provide step-by-step instructions for responding to alerts and incidents.

## 🚨 Alert Response Quick Reference

| Alert | Severity | Response Time | Primary Runbook |
|-------|----------|---------------|----------------|
| MemoryEfficiencyWarning | Warning | 15 minutes | [Memory Efficiency](memory-efficiency-alert.md) |
| MemoryEfficiencyCritical | Critical | 5 minutes | [Memory Efficiency](memory-efficiency-alert.md) |
| ResponseLatencyWarning | Warning | 10 minutes | [Response Latency](response-latency-alert.md) |
| ResponseLatencyCritical | Critical | 5 minutes | [Response Latency](response-latency-alert.md) |
| ServiceAvailabilityCritical | Critical | 2 minutes | [Service Availability](service-availability-alert.md) |

## 📖 Available Runbooks

### Core System Alerts
- **[Memory Efficiency Alert](memory-efficiency-alert.md)** - Memory lookup success rate issues
- **[Response Latency Alert](response-latency-alert.md)** - High response time issues
- **[Service Availability Alert](service-availability-alert.md)** - Service downtime and connectivity issues

### Operational Procedures
- **[Error Budget Alert](error-budget-alert.md)** - Error budget burn rate issues
- **[Conflict Resolution Alert](conflict-resolution-alert.md)** - High conflict resolution rates
- **[Engine Fallback Alert](engine-fallback-alert.md)** - C++ to JavaScript engine fallback

## 🎯 Response Priorities

### P0 - Critical (Immediate response required)
- Service completely down
- SLA violation imminent
- Multiple systems affected

### P1 - High (Response within 5 minutes)
- SLO violations
- Performance degradation
- Single system failures

### P2 - Medium (Response within 15 minutes)
- Warning alerts
- Performance issues
- Non-critical functionality affected

### P3 - Low (Response within 1 hour)
- Informational alerts
- Trend monitoring
- Preventive maintenance

## 🔧 General Troubleshooting Flow

### 1. Initial Response (0-2 minutes)
1. **Acknowledge** the alert in PagerDuty/Slack
2. **Assess** the scope and impact
3. **Check** if part of known maintenance
4. **Open** relevant dashboard and runbook

### 2. Investigation (2-10 minutes)
1. **Review** recent changes/deployments
2. **Analyze** metrics and logs
3. **Examine** traces in Jaeger
4. **Identify** potential root cause

### 3. Resolution (5-15 minutes)
1. **Apply** immediate fixes per runbook
2. **Verify** resolution with health checks
3. **Monitor** for recurrence
4. **Document** actions taken

### 4. Follow-up (15+ minutes)
1. **Confirm** sustained resolution
2. **Update** stakeholders
3. **Schedule** post-mortem if needed
4. **Update** runbooks with learnings

## 🛠️ Essential Commands

### Quick Health Check
```bash
# Service status
curl http://localhost:8081/health

# Current metrics
curl http://localhost:8081/metrics | grep -E "(memory_lookup|response_time)"

# Process status
sudo systemctl status brains-memory
```

### Service Management
```bash
# Restart service
sudo systemctl restart brains-memory

# View logs
sudo journalctl -u brains-memory -f
tail -f mcp.log
```

### Emergency Recovery
```bash
# Force restart
sudo systemctl stop brains-memory && sleep 3 && sudo systemctl start brains-memory

# Restore from backup
cp backups/structured_memory_$(date +%Y%m%d)*.yaml structured_memory.yaml
```

## 📊 Monitoring Resources

### Dashboards
- **[Primary Dashboard](http://localhost:3000/d/brains-memory-dashboard)** - Main system metrics
- **[Prometheus](http://localhost:9090)** - Raw metrics and alerts
- **[Jaeger](http://localhost:16686)** - Distributed tracing

### Key Metrics to Monitor
- `memory_lookup_hits_total / memory_lookup_requests_total` - Efficiency
- `memory_file_load_duration_seconds` - Latency
- `up{job="brains-memory"}` - Availability
- `memory_conflicts_resolved_total` - Conflict rate

## 🔐 Access and Permissions

### Required Access
- **Prometheus**: Read access to metrics
- **Grafana**: Dashboard viewing
- **Jaeger**: Trace analysis
- **Server**: SSH access for troubleshooting
- **Logs**: Read access to application logs

### Emergency Contacts
- **PagerDuty**: Auto-escalation configured
- **Slack**: #brains-memory-alerts channel
- **Engineering Lead**: @eng-lead
- **Infrastructure Team**: @infra-team

## 📚 Training Resources

### New Team Member Checklist
- [ ] Access to monitoring systems
- [ ] Familiarity with dashboard layout
- [ ] Practice with runbook procedures
- [ ] Understanding of SLI/SLO definitions
- [ ] Emergency contact information

### Regular Training
- **Monthly**: Runbook review sessions
- **Quarterly**: Incident response drills
- **Annually**: Full disaster recovery testing

## 🔄 Runbook Maintenance

### Update Schedule
- **After incidents**: Update based on lessons learned
- **Monthly**: Review for accuracy and completeness
- **Quarterly**: Validate all procedures and links

### Version Control
- All runbooks stored in git repository
- Changes reviewed through pull request process
- Version history maintained for all modifications

## 📞 Escalation Matrix

| Time Elapsed | Action | Contact |
|--------------|--------|---------|
| 0-5 minutes | Initial response | On-call engineer |
| 5-15 minutes | Technical escalation | Engineering lead |
| 15-30 minutes | Management notification | Engineering manager |
| 30+ minutes | Executive briefing | VP Engineering |

## 🎯 Success Metrics

### Runbook Effectiveness
- **MTTR** (Mean Time To Resolution): Target < 15 minutes
- **Alert Accuracy**: > 95% actionable alerts
- **Runbook Usage**: Track which procedures are most effective
- **Team Confidence**: Regular feedback on runbook quality

---

**Last Updated**: {{current_date}}  
**Maintained By**: Brains Memory System Team  
**Next Review**: {{next_review_date}}

For runbook updates or questions, contact @brains-memory-team in Slack.