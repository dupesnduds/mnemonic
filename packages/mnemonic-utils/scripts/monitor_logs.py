#!/usr/bin/env python3
"""
Automated log monitoring and alerting script.
Checks for critical errors and sends notifications.
"""

import os
import sys
import glob
import smtplib
import logging
from datetime import datetime, timedelta
from email.mime.text import MimeText
from email.mime.multipart import MimeMultipart

# Configuration
LOG_FILES = ['mcp.log', 'memory.log', 'memory_check.log']
MAX_AGE_MINUTES = 60  # Only check errors from last 60 minutes
SMTP_SERVER = os.getenv('SMTP_SERVER', 'localhost')
SMTP_PORT = int(os.getenv('SMTP_PORT', '587'))
SMTP_USERNAME = os.getenv('SMTP_USERNAME', '')
SMTP_PASSWORD = os.getenv('SMTP_PASSWORD', '')
FROM_EMAIL = os.getenv('FROM_EMAIL', 'brains-system@localhost')
TO_EMAIL = os.getenv('TO_EMAIL', 'admin@localhost')
ALERT_ENABLED = os.getenv('ALERT_ENABLED', 'false').lower() == 'true'

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler('monitor.log'),
        logging.StreamHandler(sys.stdout)
    ]
)

def check_log_file(log_file, max_age_minutes=60):
    """Check a log file for recent errors."""
    if not os.path.exists(log_file):
        logging.warning(f"Log file not found: {log_file}")
        return []
    
    cutoff_time = datetime.now() - timedelta(minutes=max_age_minutes)
    recent_errors = []
    
    try:
        with open(log_file, 'r') as f:
            for line in f:
                # Check if line contains error indicators
                if any(level in line.upper() for level in ['ERROR', 'CRITICAL', 'FATAL']):
                    # Try to extract timestamp from line
                    try:
                        # Handle different timestamp formats
                        if line.startswith('20'):  # ISO format
                            timestamp_str = line.split()[0] + ' ' + line.split()[1]
                            timestamp = datetime.fromisoformat(timestamp_str.replace('Z', ''))
                        else:
                            # Assume recent if no parseable timestamp
                            timestamp = datetime.now()
                        
                        if timestamp > cutoff_time:
                            recent_errors.append({
                                'file': log_file,
                                'timestamp': timestamp,
                                'line': line.strip(),
                                'severity': 'ERROR'
                            })
                    except (ValueError, IndexError):
                        # If timestamp parsing fails, include the error anyway
                        recent_errors.append({
                            'file': log_file,
                            'timestamp': datetime.now(),
                            'line': line.strip(),
                            'severity': 'ERROR'
                        })
    
    except Exception as e:
        logging.error(f"Error reading {log_file}: {e}")
        return []
    
    return recent_errors

def check_server_health():
    """Check if MCP server is responding."""
    try:
        import urllib.request
        import json
        
        response = urllib.request.urlopen('http://localhost:8081/health', timeout=5)
        if response.status == 200:
            data = json.loads(response.read().decode())
            if data.get('status') == 'healthy':
                return True, "Server healthy"
            else:
                return False, f"Server unhealthy: {data}"
        else:
            return False, f"Server returned status {response.status}"
    except Exception as e:
        return False, f"Server check failed: {e}"

def check_file_sizes():
    """Check for unusually large log or memory files."""
    warnings = []
    
    files_to_check = LOG_FILES + ['structured_memory.yaml', 'global_structured_memory.yaml']
    
    for file_path in files_to_check:
        if os.path.exists(file_path):
            size_mb = os.path.getsize(file_path) / (1024 * 1024)
            
            # Warn about large files
            if size_mb > 50:  # 50MB threshold
                warnings.append(f"{file_path}: Very large file ({size_mb:.1f} MB)")
            elif size_mb > 10:  # 10MB threshold
                warnings.append(f"{file_path}: Large file ({size_mb:.1f} MB)")
    
    return warnings

def send_alert(subject, message):
    """Send email alert."""
    if not ALERT_ENABLED:
        logging.info(f"Alert disabled. Would send: {subject}")
        return False
    
    try:
        msg = MimeMultipart()
        msg['From'] = FROM_EMAIL
        msg['To'] = TO_EMAIL
        msg['Subject'] = subject
        
        msg.attach(MimeText(message, 'plain'))
        
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        if SMTP_USERNAME:
            server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
        
        server.send_message(msg)
        server.quit()
        
        logging.info(f"Alert sent: {subject}")
        return True
        
    except Exception as e:
        logging.error(f"Failed to send alert: {e}")
        return False

def generate_alert_message(errors, health_issues, size_warnings):
    """Generate formatted alert message."""
    message = "🚨 Brains Memory System Alert\n"
    message += f"Time: {datetime.now().isoformat()}\n\n"
    
    if errors:
        message += f"🔴 Recent Errors ({len(errors)}):\n"
        for error in errors[-5:]:  # Show last 5 errors
            message += f"  [{error['file']}] {error['timestamp']}: {error['line']}\n"
        message += "\n"
    
    if health_issues:
        message += "🟡 Health Issues:\n"
        for issue in health_issues:
            message += f"  - {issue}\n"
        message += "\n"
    
    if size_warnings:
        message += "📊 File Size Warnings:\n"
        for warning in size_warnings:
            message += f"  - {warning}\n"
        message += "\n"
    
    message += "📍 System Location: " + os.getcwd() + "\n"
    message += "🔧 Check logs: tail -f mcp.log memory.log memory_check.log\n"
    
    return message

def main():
    """Main monitoring routine."""
    logging.info("Starting log monitoring check")
    
    all_errors = []
    health_issues = []
    
    # Check log files for errors
    for log_file in LOG_FILES:
        errors = check_log_file(log_file, MAX_AGE_MINUTES)
        all_errors.extend(errors)
        if errors:
            logging.warning(f"Found {len(errors)} recent errors in {log_file}")
    
    # Check server health
    healthy, health_msg = check_server_health()
    if not healthy:
        health_issues.append(f"MCP Server: {health_msg}")
        logging.warning(f"Server health issue: {health_msg}")
    
    # Check file sizes
    size_warnings = check_file_sizes()
    if size_warnings:
        logging.info(f"File size warnings: {len(size_warnings)}")
    
    # Send alert if issues found
    if all_errors or health_issues or size_warnings:
        severity = "CRITICAL" if all_errors else "WARNING"
        subject = f"[{severity}] Brains Memory System Alert"
        message = generate_alert_message(all_errors, health_issues, size_warnings)
        
        send_alert(subject, message)
        
        # Log summary
        logging.warning(f"Alert generated: {len(all_errors)} errors, {len(health_issues)} health issues, {len(size_warnings)} size warnings")
    else:
        logging.info("No issues detected")
    
    return len(all_errors) + len(health_issues)

if __name__ == '__main__':
    if '--help' in sys.argv:
        print("Usage: python monitor_logs.py [--test-alert]")
        print("Environment variables:")
        print("  SMTP_SERVER    - SMTP server hostname (default: localhost)")
        print("  SMTP_PORT      - SMTP server port (default: 587)")
        print("  SMTP_USERNAME  - SMTP username")
        print("  SMTP_PASSWORD  - SMTP password")
        print("  FROM_EMAIL     - From email address")
        print("  TO_EMAIL       - To email address")
        print("  ALERT_ENABLED  - Set to 'true' to enable email alerts")
        sys.exit(0)
    
    if '--test-alert' in sys.argv:
        logging.info("Sending test alert")
        success = send_alert(
            "Test Alert - Brains Memory System",
            "This is a test alert to verify monitoring configuration.\n\n" +
            f"Time: {datetime.now().isoformat()}\n" +
            f"System: {os.getcwd()}"
        )
        sys.exit(0 if success else 1)
    
    try:
        issues_found = main()
        sys.exit(1 if issues_found > 0 else 0)
    except KeyboardInterrupt:
        logging.info("Monitoring interrupted by user")
        sys.exit(1)
    except Exception as e:
        logging.error(f"Monitoring failed: {e}")
        sys.exit(1)