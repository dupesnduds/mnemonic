#!/bin/bash

# Brains Memory System Shell Integration
# Automatically intercepts command failures and provides intelligent solutions
# Source this file in your .bashrc or .zshrc: source /path/to/brains-shell-integration.sh

# Configuration
BRAINS_AUTO_INTERCEPT=${BRAINS_AUTO_INTERCEPT:-true}
BRAINS_INTERCEPT_THRESHOLD=${BRAINS_INTERCEPT_THRESHOLD:-2}  # Intercept after N seconds
BRAINS_CLI_PATH="${BRAINS_CLI_PATH:-$(dirname "${BASH_SOURCE[0]}")/../bin/brains-intercept.js}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Track command execution
brains_command_start_time=0
brains_last_command=""
brains_last_exit_code=0

# Function to check if brains memory system is available
brains_check_available() {
    if [[ -f "$BRAINS_CLI_PATH" ]] && command -v node >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Function to determine if command should be intercepted
brains_should_intercept() {
    local cmd="$1"
    local exit_code="$2"
    local duration="$3"
    
    # Don't intercept if disabled
    if [[ "$BRAINS_AUTO_INTERCEPT" != "true" ]]; then
        return 1
    fi
    
    # Don't intercept successful commands
    if [[ $exit_code -eq 0 ]]; then
        return 1
    fi
    
    # Don't intercept very quick failures (likely syntax errors)
    if [[ $duration -lt $BRAINS_INTERCEPT_THRESHOLD ]]; then
        return 1
    fi
    
    # Intercept specific command types
    case "$cmd" in
        npm*|yarn*|node*|python*|pip*|docker*|git*|make*|cmake*|gcc*|g++*)
            return 0
            ;;
        *)
            # For other commands, only intercept if they contain certain keywords
            if echo "$cmd" | grep -qE "(install|build|compile|deploy|test|run)"; then
                return 0
            fi
            return 1
            ;;
    esac
}

# Function to extract meaningful error context
brains_extract_error_context() {
    local cmd="$1"
    local context=""
    
    # Add technology context based on command
    case "$cmd" in
        npm*)
            context="npm package-manager nodejs"
            ;;
        yarn*)
            context="yarn package-manager nodejs"
            ;;
        node*)
            context="nodejs javascript"
            ;;
        python*|pip*)
            context="python programming"
            ;;
        docker*)
            context="docker containerization"
            ;;
        git*)
            context="git version-control"
            ;;
        make*|cmake*)
            context="build-system compilation"
            ;;
        gcc*|g++*)
            context="compilation c-cpp"
            ;;
    esac
    
    # Add working directory context
    local pwd_basename=$(basename "$PWD")
    context="$context project:$pwd_basename"
    
    echo "$context"
}

# Function to provide intelligent error analysis
brains_analyze_command_failure() {
    local cmd="$1"
    local exit_code="$2"
    local duration="$3"
    
    if ! brains_check_available; then
        echo -e "${YELLOW}🧠 Brains Memory System not available${NC}"
        return
    fi
    
    if ! brains_should_intercept "$cmd" "$exit_code" "$duration"; then
        return
    fi
    
    echo
    echo -e "${BLUE}🧠 BRAINS COMMAND ANALYSIS${NC}"
    echo -e "${BLUE}=============================${NC}"
    echo -e "${YELLOW}Command:${NC} $cmd"
    echo -e "${YELLOW}Exit Code:${NC} $exit_code"
    echo -e "${YELLOW}Duration:${NC} ${duration}s"
    echo -e "${YELLOW}Context:${NC} $(brains_extract_error_context "$cmd")"
    
    # Quick memory lookup for common patterns
    brains_quick_lookup "$cmd" "$exit_code"
    
    echo -e "${BLUE}=============================${NC}"
    echo -e "${GREEN}💡 Tip: Run 'brains-intercept $cmd' for detailed analysis${NC}"
    echo
}

# Function for quick memory lookup without full interception
brains_quick_lookup() {
    local cmd="$1"
    local exit_code="$2"
    
    # Provide quick suggestions based on common patterns
    case "$exit_code" in
        1)
            case "$cmd" in
                npm*)
                    echo -e "${GREEN}💡 Quick Fix: Try 'rm -rf node_modules package-lock.json && npm install'${NC}"
                    ;;
                node*)
                    echo -e "${GREEN}💡 Quick Fix: Check for syntax errors or missing modules${NC}"
                    ;;
                python*)
                    echo -e "${GREEN}💡 Quick Fix: Check Python path and module installations${NC}"
                    ;;
                docker*)
                    echo -e "${GREEN}💡 Quick Fix: Check Docker daemon is running and permissions${NC}"
                    ;;
            esac
            ;;
        127)
            echo -e "${GREEN}💡 Quick Fix: Command not found - check if it's installed and in PATH${NC}"
            ;;
        130)
            echo -e "${GREEN}💡 Info: Command interrupted by user (Ctrl+C)${NC}"
            ;;
        *)
            echo -e "${GREEN}💡 Run 'brains-intercept $cmd' for intelligent error analysis${NC}"
            ;;
    esac
}

# Function to record command success for learning
brains_record_success() {
    local cmd="$1"
    local duration="$2"
    
    # If previous command failed and this one succeeded, suggest storing the solution
    if [[ $brains_last_exit_code -ne 0 ]] && [[ "$BRAINS_AUTO_INTERCEPT" == "true" ]]; then
        if brains_should_intercept "$brains_last_command" "$brains_last_exit_code" "$duration"; then
            echo -e "${GREEN}✅ Success after previous failure!${NC}"
            echo -e "${YELLOW}💡 Consider storing this solution: brains-memory store \"$brains_last_command failed\" \"$(brains_extract_error_context "$brains_last_command")\" \"$cmd\"${NC}"
        fi
    fi
}

# Pre-command execution hook
brains_preexec() {
    brains_command_start_time=$(date +%s)
}

# Post-command execution hook
brains_precmd() {
    local exit_code=$?
    local end_time=$(date +%s)
    local duration=$((end_time - brains_command_start_time))
    local cmd="${brains_last_command:-$1}"
    
    if [[ $exit_code -eq 0 ]]; then
        brains_record_success "$cmd" "$duration"
    else
        brains_analyze_command_failure "$cmd" "$exit_code" "$duration"
    fi
    
    brains_last_command="$cmd"
    brains_last_exit_code=$exit_code
}

# Setup hooks based on shell type
if [[ -n "$ZSH_VERSION" ]]; then
    # Zsh hooks
    autoload -U add-zsh-hook
    
    preexec_brains() {
        brains_last_command="$1"
        brains_preexec
    }
    
    precmd_brains() {
        brains_precmd
    }
    
    add-zsh-hook preexec preexec_brains
    add-zsh-hook precmd precmd_brains
    
elif [[ -n "$BASH_VERSION" ]]; then
    # Bash hooks
    brains_debug_trap() {
        brains_last_command="$BASH_COMMAND"
        brains_preexec
    }
    
    # Set debug trap for command capture
    trap 'brains_debug_trap' DEBUG
    
    # Set PROMPT_COMMAND for post-execution
    if [[ -z "$PROMPT_COMMAND" ]]; then
        PROMPT_COMMAND="brains_precmd"
    else
        PROMPT_COMMAND="brains_precmd; $PROMPT_COMMAND"
    fi
fi

# Utility functions for manual use
alias brains-help='echo -e "${BLUE}🧠 Brains Memory System Commands:${NC}
  brains-intercept <cmd>    - Run command with error analysis
  brains-memory stats       - Show memory statistics  
  brains-memory find <text> - Search for solutions
  brains-memory store <problem> <category> <solution> - Store solution
  brains-toggle             - Toggle auto-interception
  brains-status             - Show integration status"'

brains-toggle() {
    if [[ "$BRAINS_AUTO_INTERCEPT" == "true" ]]; then
        export BRAINS_AUTO_INTERCEPT=false
        echo -e "${YELLOW}🧠 Brains auto-interception disabled${NC}"
    else
        export BRAINS_AUTO_INTERCEPT=true
        echo -e "${GREEN}🧠 Brains auto-interception enabled${NC}"
    fi
}

brains-status() {
    echo -e "${BLUE}🧠 Brains Memory System Status${NC}"
    echo -e "${BLUE}==============================${NC}"
    
    if brains_check_available; then
        echo -e "${GREEN}✅ Memory System: Available${NC}"
    else
        echo -e "${RED}❌ Memory System: Not Available${NC}"
    fi
    
    if [[ "$BRAINS_AUTO_INTERCEPT" == "true" ]]; then
        echo -e "${GREEN}✅ Auto-Interception: Enabled${NC}"
    else
        echo -e "${YELLOW}⚠️  Auto-Interception: Disabled${NC}"
    fi
    
    echo -e "${BLUE}Intercept Threshold: ${BRAINS_INTERCEPT_THRESHOLD}s${NC}"
    echo -e "${BLUE}CLI Path: $BRAINS_CLI_PATH${NC}"
    
    if brains_check_available; then
        echo -e "${BLUE}Memory Statistics:${NC}"
        node "$BRAINS_CLI_PATH/../brains-memory" stats 2>/dev/null || echo "  Stats unavailable"
    fi
}

# Show integration status on load
if [[ "$BRAINS_AUTO_INTERCEPT" == "true" ]] && brains_check_available; then
    echo -e "${GREEN}🧠 Brains Memory System integrated! Type 'brains-help' for commands.${NC}"
elif [[ "$BRAINS_AUTO_INTERCEPT" == "true" ]]; then
    echo -e "${YELLOW}🧠 Brains Memory System enabled but not available. Install dependencies.${NC}"
fi