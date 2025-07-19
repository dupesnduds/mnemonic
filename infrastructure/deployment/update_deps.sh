#!/bin/bash

# Dependency update automation script
# Checks for outdated dependencies and security vulnerabilities

set -euo pipefail

# Configuration
RESULTS_FILE="dependency_report.log"
UPDATE_THRESHOLD_DAYS=90  # Only suggest updates older than this

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}" | tee -a "$RESULTS_FILE"
}

# Function to check Node.js dependencies
check_npm_dependencies() {
    print_status $BLUE "🔍 Checking Node.js dependencies..."
    
    if [ ! -f "package.json" ]; then
        print_status $YELLOW "⚠️  No package.json found, skipping npm checks"
        return 0
    fi
    
    # Check for outdated packages
    print_status $YELLOW "📦 Checking for outdated npm packages..."
    
    if command -v npm &> /dev/null; then
        # Generate outdated report
        npm outdated --json > npm_outdated.json 2>/dev/null || echo "{}" > npm_outdated.json
        
        if [ -s npm_outdated.json ] && [ "$(cat npm_outdated.json)" != "{}" ]; then
            print_status $YELLOW "📋 Outdated npm packages found:"
            
            # Parse JSON and display results
            node -e "
                const data = JSON.parse(require('fs').readFileSync('npm_outdated.json', 'utf8'));
                Object.entries(data).forEach(([pkg, info]) => {
                    console.log(\`  📦 \${pkg}: \${info.current} → \${info.latest} (wanted: \${info.wanted})\`);
                });
            " 2>/dev/null || print_status $RED "❌ Failed to parse outdated packages"
            
            # Check if any updates are critical (major version behind)
            local critical_updates=$(node -e "
                const data = JSON.parse(require('fs').readFileSync('npm_outdated.json', 'utf8'));
                let critical = 0;
                Object.entries(data).forEach(([pkg, info]) => {
                    const currentMajor = parseInt(info.current.split('.')[0]);
                    const latestMajor = parseInt(info.latest.split('.')[0]);
                    if (latestMajor > currentMajor) critical++;
                });
                console.log(critical);
            " 2>/dev/null || echo "0")
            
            if [ "$critical_updates" -gt 0 ]; then
                print_status $RED "⚠️  $critical_updates critical updates available (major version changes)"
            fi
        else
            print_status $GREEN "✅ All npm packages are up to date"
        fi
        
        # Security audit
        print_status $YELLOW "🔒 Running npm security audit..."
        
        if npm audit --json > npm_audit.json 2>/dev/null; then
            local vulnerabilities=$(node -e "
                const data = JSON.parse(require('fs').readFileSync('npm_audit.json', 'utf8'));
                console.log(data.metadata?.vulnerabilities?.total || 0);
            " 2>/dev/null || echo "0")
            
            if [ "$vulnerabilities" -gt 0 ]; then
                print_status $RED "🚨 $vulnerabilities security vulnerabilities found"
                
                # Show severity breakdown
                node -e "
                    const data = JSON.parse(require('fs').readFileSync('npm_audit.json', 'utf8'));
                    const v = data.metadata?.vulnerabilities || {};
                    if (v.critical) console.log(\`  🔴 Critical: \${v.critical}\`);
                    if (v.high) console.log(\`  🟠 High: \${v.high}\`);
                    if (v.moderate) console.log(\`  🟡 Moderate: \${v.moderate}\`);
                    if (v.low) console.log(\`  🟢 Low: \${v.low}\`);
                " 2>/dev/null
                
                print_status $YELLOW "💡 Run 'npm audit fix' to attempt automatic fixes"
            else
                print_status $GREEN "✅ No security vulnerabilities found"
            fi
        else
            print_status $YELLOW "⚠️  Security audit failed or no vulnerabilities database available"
        fi
        
        # Clean up temporary files
        rm -f npm_outdated.json npm_audit.json
        
    else
        print_status $RED "❌ npm not found"
        return 1
    fi
}

# Function to check Python dependencies
check_python_dependencies() {
    print_status $BLUE "🐍 Checking Python dependencies..."
    
    if [ ! -f "requirements.txt" ]; then
        print_status $YELLOW "⚠️  No requirements.txt found, skipping Python checks"
        return 0
    fi
    
    if command -v pip &> /dev/null || command -v pip3 &> /dev/null; then
        local pip_cmd="pip"
        if command -v pip3 &> /dev/null; then
            pip_cmd="pip3"
        fi
        
        print_status $YELLOW "📦 Checking for outdated Python packages..."
        
        # Get list of outdated packages
        local outdated_output=$($pip_cmd list --outdated --format=json 2>/dev/null || echo "[]")
        
        if [ "$outdated_output" != "[]" ] && [ -n "$outdated_output" ]; then
            print_status $YELLOW "📋 Outdated Python packages found:"
            
            # Parse and display results
            echo "$outdated_output" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    for pkg in data:
        print(f\"  📦 {pkg['name']}: {pkg['version']} → {pkg['latest_version']}\")
except:
    print('  ❌ Failed to parse outdated packages')
            " 2>/dev/null
            
            # Check for packages in requirements.txt that are outdated
            local req_outdated=0
            while read -r line; do
                if [[ $line =~ ^[a-zA-Z] ]]; then
                    local pkg_name=$(echo "$line" | cut -d'=' -f1 | cut -d'>' -f1 | cut -d'<' -f1)
                    if echo "$outdated_output" | grep -q "\"name\": \"$pkg_name\""; then
                        req_outdated=$((req_outdated + 1))
                    fi
                fi
            done < requirements.txt
            
            if [ $req_outdated -gt 0 ]; then
                print_status $YELLOW "⚠️  $req_outdated packages from requirements.txt are outdated"
            fi
        else
            print_status $GREEN "✅ All Python packages are up to date"
        fi
        
        # Check for security vulnerabilities (if safety is installed)
        if command -v safety &> /dev/null; then
            print_status $YELLOW "🔒 Running Python security check..."
            
            if safety check --json > safety_report.json 2>/dev/null; then
                local vulnerabilities=$(python3 -c "
import json
try:
    with open('safety_report.json') as f:
        data = json.load(f)
    print(len(data))
except:
    print(0)
                " 2>/dev/null || echo "0")
                
                if [ "$vulnerabilities" -gt 0 ]; then
                    print_status $RED "🚨 $vulnerabilities Python security vulnerabilities found"
                    print_status $YELLOW "💡 Check safety_report.json for details"
                else
                    print_status $GREEN "✅ No Python security vulnerabilities found"
                fi
            else
                print_status $YELLOW "⚠️  Python security check failed"
            fi
            
            rm -f safety_report.json
        else
            print_status $YELLOW "💡 Install 'safety' package for Python security checks: pip install safety"
        fi
        
    else
        print_status $RED "❌ pip not found"
        return 1
    fi
}

# Function to check system dependencies
check_system_dependencies() {
    print_status $BLUE "🖥️  Checking system dependencies..."
    
    local deps_ok=true
    
    # Check Node.js version
    if command -v node &> /dev/null; then
        local node_version=$(node --version | sed 's/v//')
        local node_major=$(echo "$node_version" | cut -d'.' -f1)
        
        print_status $GREEN "✅ Node.js: $node_version"
        
        if [ "$node_major" -lt 16 ]; then
            print_status $YELLOW "⚠️  Node.js version is quite old (recommend v18+)"
        fi
    else
        print_status $RED "❌ Node.js not found"
        deps_ok=false
    fi
    
    # Check Python version
    if command -v python3 &> /dev/null; then
        local python_version=$(python3 --version | cut -d' ' -f2)
        local python_major=$(echo "$python_version" | cut -d'.' -f1)
        local python_minor=$(echo "$python_version" | cut -d'.' -f2)
        
        print_status $GREEN "✅ Python: $python_version"
        
        if [ "$python_major" -lt 3 ] || ([ "$python_major" -eq 3 ] && [ "$python_minor" -lt 8 ]); then
            print_status $YELLOW "⚠️  Python version is old (recommend 3.9+)"
        fi
    else
        print_status $RED "❌ Python3 not found"
        deps_ok=false
    fi
    
    # Check curl (needed for API calls)
    if command -v curl &> /dev/null; then
        print_status $GREEN "✅ curl available"
    else
        print_status $YELLOW "⚠️  curl not found (needed for API testing)"
    fi
    
    return $($deps_ok)
}

# Function to generate update recommendations
generate_recommendations() {
    print_status $BLUE "💡 Update Recommendations"
    print_status $BLUE "========================="
    
    {
        echo ""
        echo "## Immediate Actions"
        echo ""
        
        # Check for critical npm vulnerabilities
        if [ -f "npm_audit.json" ]; then
            local critical=$(node -e "console.log(JSON.parse(require('fs').readFileSync('npm_audit.json')).metadata?.vulnerabilities?.critical || 0)" 2>/dev/null || echo "0")
            if [ "$critical" -gt 0 ]; then
                echo "🚨 **URGENT**: Fix $critical critical npm vulnerabilities:"
                echo "   \`npm audit fix --force\`"
                echo ""
            fi
        fi
        
        echo "## Monthly Updates"
        echo ""
        echo "1. **Update npm packages**:"
        echo "   \`npm update\`"
        echo "   \`npm audit fix\`"
        echo ""
        echo "2. **Update Python packages**:"
        echo "   \`pip install -r requirements.txt --upgrade\`"
        echo ""
        echo "3. **Verify system compatibility**:"
        echo "   \`./test_system.sh\`"
        echo ""
        
        echo "## Quarterly Reviews"
        echo ""
        echo "1. **Check for major version updates**"
        echo "2. **Review Claude Code compatibility**: \`claude --version\`"
        echo "3. **Update Node.js/Python if needed**"
        echo ""
        
        echo "## Automation Setup"
        echo ""
        echo "Add to crontab for monthly checks:"
        echo "\`0 9 1 * * cd $(pwd) && ./update_deps.sh >> dependency_cron.log 2>&1\`"
        echo ""
        
    } | tee -a "$RESULTS_FILE"
}

# Function to perform safe updates (if requested)
perform_safe_updates() {
    print_status $BLUE "🔄 Performing safe updates..."
    
    local updates_made=false
    
    # Update npm packages (patch and minor versions only)
    if [ -f "package.json" ] && command -v npm &> /dev/null; then
        print_status $YELLOW "📦 Updating npm packages (safe updates only)..."
        
        if npm update 2>&1 | tee -a "$RESULTS_FILE"; then
            print_status $GREEN "✅ npm packages updated"
            updates_made=true
        else
            print_status $RED "❌ npm update failed"
        fi
    fi
    
    # Run tests after updates
    if $updates_made; then
        print_status $YELLOW "🧪 Running tests after updates..."
        
        if [ -f "test_system.sh" ]; then
            if ./test_system.sh >> "$RESULTS_FILE" 2>&1; then
                print_status $GREEN "✅ Tests passed after updates"
            else
                print_status $RED "❌ Tests failed after updates - consider rollback"
            fi
        else
            print_status $YELLOW "⚠️  No test script found - manual verification recommended"
        fi
    fi
}

# Function to generate summary report
generate_summary() {
    local end_time=$(date)
    
    {
        echo ""
        echo "========================================"
        echo "Dependency Update Report Summary"
        echo "========================================"
        echo "Generated: $end_time"
        echo "System: $(pwd)"
        echo ""
        
        # Count issues found
        local npm_outdated=$(grep -c "📦.*→" "$RESULTS_FILE" 2>/dev/null || echo "0")
        local vulnerabilities=$(grep -c "🚨.*vulnerabilities" "$RESULTS_FILE" 2>/dev/null || echo "0")
        local warnings=$(grep -c "⚠️" "$RESULTS_FILE" 2>/dev/null || echo "0")
        
        echo "Issues Found:"
        echo "  Outdated packages: $npm_outdated"
        echo "  Security vulnerabilities: $vulnerabilities"
        echo "  Warnings: $warnings"
        echo ""
        
        if [ "$npm_outdated" -eq 0 ] && [ "$vulnerabilities" -eq 0 ] && [ "$warnings" -eq 0 ]; then
            echo "🎉 All dependencies are up to date and secure!"
        elif [ "$vulnerabilities" -gt 0 ]; then
            echo "🚨 Action required: Security vulnerabilities detected"
        elif [ "$npm_outdated" -gt 0 ]; then
            echo "📦 Consider updating outdated packages"
        else
            echo "✅ System is in good condition"
        fi
        
        echo ""
        echo "Next check recommended: $(date -d '+1 month' '+%Y-%m-%d')"
        echo "========================================"
    } | tee -a "$RESULTS_FILE"
}

# Main execution
main() {
    print_status $BLUE "🔧 Dependency Update Check"
    print_status $BLUE "==========================="
    
    # Initialize results file
    {
        echo "Dependency Update Report"
        echo "Started: $(date)"
        echo "========================================"
    } > "$RESULTS_FILE"
    
    # Run checks
    check_system_dependencies
    check_npm_dependencies
    check_python_dependencies
    
    # Generate recommendations
    generate_recommendations
    
    # Perform updates if requested
    if [ "${1:-}" = "--update" ]; then
        perform_safe_updates
    elif [ "${1:-}" = "--help" ]; then
        echo "Usage: $0 [--update] [--help]"
        echo ""
        echo "Options:"
        echo "  --update    Perform safe package updates"
        echo "  --help      Show this help message"
        echo ""
        echo "This script checks for outdated dependencies and security vulnerabilities."
        echo "Results are saved to: $RESULTS_FILE"
        exit 0
    fi
    
    # Generate summary
    generate_summary
    
    print_status $GREEN "✅ Dependency check completed!"
    print_status $YELLOW "📊 Full report saved to: $RESULTS_FILE"
    
    # Return appropriate exit code
    local issues=$(grep -c "🚨\|❌" "$RESULTS_FILE" 2>/dev/null || echo "0")
    if [ "$issues" -gt 0 ]; then
        print_status $YELLOW "⚠️  $issues issues found - review report for details"
        exit 1
    else
        exit 0
    fi
}

# Run main function
main "$@"