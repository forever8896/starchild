#!/bin/bash
#
# The Agency v2 - Individual Agent Runner
#
# Token-efficient design:
# - Agents spawn fresh for EACH task (no accumulated context)
# - Minimal prompt - just what's needed for current work
# - Exit after completing ONE task
#
# Usage: ./run-agent.sh <agent-name>
#

set -e

# ============================================================================
# CONFIGURATION - Override these with environment variables
# ============================================================================

# Agency files location (can be your Obsidian vault)
AGENCY_DIR="${AGENCY_DIR:-$(dirname "$(realpath "$0")")}"

# Runtime data directory (gitignored, contains actual work state)
DATA_DIR="${DATA_DIR:-$AGENCY_DIR/agency/data}"

# Where to create actual code projects (not specs, real code)
PROJECTS_DIR="${PROJECTS_DIR:-$HOME/projects}"

# How long to wait between checking for work (seconds)
POLL_INTERVAL="${POLL_INTERVAL:-30}"

# ============================================================================

AGENT_NAME="${1:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

declare -A AGENT_COLORS=(
    ["product-owner"]="$MAGENTA"
    ["tech-lead"]="$BLUE"
    ["dev-alpha"]="$GREEN"
    ["dev-beta"]="$GREEN"
    ["dev-gamma"]="$GREEN"
    ["qa"]="$YELLOW"
    ["reviewer"]="$MAGENTA"
    ["devops"]="$CYAN"
)

usage() {
    echo -e "${CYAN}The Agency v2 - Squad Model${NC}"
    echo ""
    echo "Usage: $0 <agent-name>"
    echo ""
    echo "Configuration (via environment):"
    echo "  AGENCY_DIR    - Agency files location (default: script directory)"
    echo "  PROJECTS_DIR  - Where to create code projects (default: ~/projects)"
    echo "  POLL_INTERVAL - Seconds between work checks (default: 30)"
    echo ""
    echo "Examples:"
    echo "  AGENCY_DIR=~/obsidian/Agency ./run-agent.sh dev-alpha"
    echo "  PROJECTS_DIR=~/code ./run-agent.sh tech-lead"
    echo ""
    echo "Available agents:"
    echo "  product-owner - Triages requests, defines acceptance criteria"
    echo "  tech-lead     - Technical decisions, unblocks devs, can code"
    echo "  dev-alpha     - Builder (general)"
    echo "  dev-beta      - Builder (backend/optimization focus)"
    echo "  dev-gamma     - Builder (frontend/UX focus)"
    echo "  qa            - Quality gate, verifies work before shipping"
    echo "  reviewer      - Code quality reviews (optional)"
    echo "  devops        - Deployment, monitoring, DORA metrics"
    exit 1
}

if [[ -z "$AGENT_NAME" ]]; then
    usage
fi

AGENT_DIR="$AGENCY_DIR/agents/$AGENT_NAME"

if [[ ! -d "$AGENT_DIR" ]]; then
    echo -e "${RED}Error: Unknown agent '$AGENT_NAME'${NC}"
    usage
fi

AGENT_PROMPT="$AGENT_DIR/AGENT.md"
COLOR="${AGENT_COLORS[$AGENT_NAME]:-$NC}"

log() {
    echo -e "${COLOR}[$(date '+%H:%M:%S')] [$AGENT_NAME]${NC} $1"
}

# Check if there's work for this agent type
# Returns 0 (true) if work exists, 1 (false) otherwise
has_work() {
    case "$AGENT_NAME" in
        product-owner)
            grep -q "## NEW:" "$DATA_DIR/inbox.md" 2>/dev/null
            ;;
        tech-lead)
            grep -q "BLOCKED:" "$DATA_DIR/standup.md" 2>/dev/null || \
            grep -q "## READY:" "$DATA_DIR/backlog.md" 2>/dev/null
            ;;
        dev-alpha|dev-beta|dev-gamma)
            grep -q "## READY:" "$DATA_DIR/backlog.md" 2>/dev/null
            ;;
        qa)
            # QA verifies completed work before shipping
            grep -q "## DONE:" "$DATA_DIR/backlog.md" 2>/dev/null
            ;;
        reviewer)
            # Reviewer handles QA_PASSED items flagged for review, or explicit review requests
            grep -q "## QA_PASSED:.*Review Required: yes" "$DATA_DIR/backlog.md" 2>/dev/null || \
            grep -q "Review Required: yes" "$DATA_DIR/backlog.md" 2>/dev/null && \
            grep -q "## QA_PASSED:" "$DATA_DIR/backlog.md" 2>/dev/null || \
            ls "$DATA_DIR/handoffs/review-request-"*.md >/dev/null 2>&1
            ;;
        devops)
            # DevOps ships QA_PASSED items (no review) or REVIEWED items (review done)
            grep -q "## QA_PASSED:" "$DATA_DIR/backlog.md" 2>/dev/null || \
            grep -q "## REVIEWED:" "$DATA_DIR/backlog.md" 2>/dev/null
            ;;
        *)
            return 1
            ;;
    esac
}

# Build minimal prompt - just what the agent needs for THIS task
# Key insight: Don't load everything, just the relevant context
build_prompt() {
    local prompt
    prompt=$(cat "$AGENT_PROMPT")

    # Add paths and minimal context
    prompt="$prompt

## Paths

- **Agency files:** $AGENCY_DIR
- **Runtime data:** $DATA_DIR
- **Code projects:** $PROJECTS_DIR (create new projects here, not in agency folder)
- Inbox: $DATA_DIR/inbox.md
- Backlog: $DATA_DIR/backlog.md
- Standup: $DATA_DIR/standup.md
- Board: $DATA_DIR/board.md
- Metrics: $DATA_DIR/metrics.md
- Handoffs: $DATA_DIR/handoffs/

## Current Time
$(date '+%Y-%m-%d %H:%M:%S')

## CRITICAL: Token Efficiency

You are a STATELESS agent. To minimize token usage:

1. **DO ONE TASK, THEN EXIT** - Don't loop or check for more work
2. **Read only what you need** - Don't read files 'just to check'
3. **Write concise updates** - Short standup entries, minimal handoffs
4. **Exit when done** - After completing your task, simply stop

When you finish your task (or find no actionable work), just stop responding.
The orchestrator will spawn a fresh instance when new work arrives.
"
    echo "$prompt"
}

main() {
    log "Starting (DATA_DIR=$DATA_DIR, PROJECTS_DIR=$PROJECTS_DIR)"

    while true; do
        if has_work; then
            log "${GREEN}Work found - spawning fresh Claude session...${NC}"

            PROMPT=$(build_prompt)

            # Spawn fresh Claude session for this ONE task
            # Using --dangerously-skip-permissions for autonomous operation
            # Session ends when agent completes task and stops responding
            unset CLAUDECODE
            claude -p "$PROMPT" --dangerously-skip-permissions

            EXIT_CODE=$?
            log "Session ended (exit: $EXIT_CODE)"

            # Brief pause before checking for more work
            sleep 5
        else
            log "No work. Sleeping ${POLL_INTERVAL}s..."
            sleep "$POLL_INTERVAL"
        fi
    done
}

trap 'echo ""; log "Shutting down..."; exit 0' INT TERM

main
