#!/bin/bash

# Brains Memory System Shell Integration Deployment Script
# Automatically sets up workflow integration for current user

set -e

BRAINS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHELL_INTEGRATION_FILE="$BRAINS_DIR/shell/brains-shell-integration.sh"

echo "🔗 Deploying Brains Shell Integration"
echo "====================================="
echo "Installation directory: $BRAINS_DIR"
echo ""

# Detect user's shell
USER_SHELL=$(basename "$SHELL")
echo "Detected shell: $USER_SHELL"

# Determine config file
case "$USER_SHELL" in
    bash)
        CONFIG_FILE="$HOME/.bashrc"
        ;;
    zsh)
        CONFIG_FILE="$HOME/.zshrc"
        ;;
    *)
        echo "⚠️  Shell not fully supported: $USER_SHELL"
        echo "Manual setup required. See WORKFLOW_INTEGRATION_GUIDE.md"
        CONFIG_FILE="$HOME/.profile"
        ;;
esac

echo "Config file: $CONFIG_FILE"
echo ""

# Check if already integrated
INTEGRATION_LINE="source \"$SHELL_INTEGRATION_FILE\""
if grep -q "brains-shell-integration.sh" "$CONFIG_FILE" 2>/dev/null; then
    echo "✅ Brains integration already present in $CONFIG_FILE"
else
    echo "📝 Adding Brains integration to $CONFIG_FILE..."
    
    # Add integration line to config
    echo "" >> "$CONFIG_FILE"
    echo "# Brains Memory System Integration" >> "$CONFIG_FILE"
    echo "$INTEGRATION_LINE" >> "$CONFIG_FILE"
    
    echo "✅ Integration added to $CONFIG_FILE"
fi

# Set environment variables for current session
export BRAINS_AUTO_INTERCEPT=true
export BRAINS_INTERCEPT_THRESHOLD=2
export BRAINS_CLI_PATH="$BRAINS_DIR/bin/brains-intercept.js"

echo ""
echo "🧠 Setting up environment variables..."
echo "BRAINS_AUTO_INTERCEPT=true"
echo "BRAINS_INTERCEPT_THRESHOLD=2"
echo "BRAINS_CLI_PATH=$BRAINS_CLI_PATH"

# Create global links for CLI tools
echo ""
echo "🔗 Creating global CLI tool links..."

# Create symlinks in a directory that's likely in PATH
LOCAL_BIN="$HOME/.local/bin"
if [[ ":$PATH:" == *":$LOCAL_BIN:"* ]]; then
    mkdir -p "$LOCAL_BIN"
    
    ln -sf "$BRAINS_DIR/bin/cli.js" "$LOCAL_BIN/brains-memory" 2>/dev/null || true
    ln -sf "$BRAINS_DIR/bin/brains-intercept.js" "$LOCAL_BIN/brains-intercept" 2>/dev/null || true
    ln -sf "$BRAINS_DIR/bin/brains-coach.js" "$LOCAL_BIN/brains-coach" 2>/dev/null || true
    
    echo "✅ CLI tools linked to $LOCAL_BIN"
else
    echo "⚠️  $LOCAL_BIN not in PATH. Using npx for CLI tools."
fi

# Test the integration
echo ""
echo "🧪 Testing shell integration..."

# Source the integration file for current session
source "$SHELL_INTEGRATION_FILE"

# Test basic commands
echo "Testing brains-memory command..."
if command -v brains-memory >/dev/null 2>&1; then
    echo "✅ brains-memory available globally"
else
    echo "⚠️  Using npx brains-memory"
fi

echo "Testing brains-intercept command..."
if command -v brains-intercept >/dev/null 2>&1; then
    echo "✅ brains-intercept available globally"
else
    echo "⚠️  Using npx brains-intercept"
fi

echo "Testing brains-coach command..."
if command -v brains-coach >/dev/null 2>&1; then
    echo "✅ brains-coach available globally"
else
    echo "⚠️  Using npx brains-coach"
fi

# Show integration status
echo ""
echo "📊 Integration Status:"
brains-status 2>/dev/null || echo "Integration will be active after shell restart"

echo ""
echo "🎉 Shell Integration Deployment Complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Restart your shell: exec $USER_SHELL"
echo "2. Test with: brains-status"
echo "3. Try: brains-intercept echo 'test'"
echo "4. Use: brains-coach 'your problem description'"
echo ""
echo "📚 For detailed usage, see: WORKFLOW_INTEGRATION_GUIDE.md"