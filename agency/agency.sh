#!/bin/bash
#
# The Agency v2 - Squad Model Orchestrator
#
# Based on data-driven research:
# - DORA metrics for measuring performance
# - Spotify squad model for team structure
# - Amazon two-pizza teams for sizing
# - Async standups to reduce interrupt cost
# - Reduced handoffs for faster cycle time
# - Token-efficient stateless agents
#
# Usage:
#   ./agency.sh              - Start all agents
#   ./agency.sh start        - Start all agents
#   ./agency.sh stop         - Stop all agents
#   ./agency.sh status       - Show agent status
#   ./agency.sh <agent>      - Run single agent
#
# Configuration (environment variables):
#   AGENCY_DIR    - Agency files (default: script dir, can be Obsidian vault)
#   PROJECTS_DIR  - Code projects location (default: ~/projects)
#   POLL_INTERVAL - Seconds between work checks (default: 30)
#
# Examples:
#   AGENCY_DIR=~/obsidian/Agency ./agency.sh start
#   PROJECTS_DIR=~/code AGENCY_DIR=~/obsidian/Agency ./agency.sh start
#

set -e

# ============================================================================
# CONFIGURATION
# ============================================================================

# Agency files location (can point to your Obsidian vault)
AGENCY_DIR="${AGENCY_DIR:-$(dirname "$(realpath "$0")")}"

# Runtime data directory (gitignored, contains actual work state)
DATA_DIR="${DATA_DIR:-$AGENCY_DIR/agency/data}"

# Where agents create actual code projects (not specs)
PROJECTS_DIR="${PROJECTS_DIR:-$HOME/projects}"

# How often agents check for work (seconds)
POLL_INTERVAL="${POLL_INTERVAL:-30}"

# Export for child processes (run-agent.sh)
export AGENCY_DIR DATA_DIR PROJECTS_DIR POLL_INTERVAL

PID_DIR="$AGENCY_DIR/.pids"

# Squad composition:
# - 3 devs + tech-lead who can code = 4 parallel builders
# - Cross-functional team with end-to-end ownership
# - QA as mandatory quality gate before shipping
# - Reviewer for code quality (optional, triggered when flagged)
AGENTS=("product-owner" "tech-lead" "dev-alpha" "dev-beta" "dev-gamma" "qa" "reviewer" "devops")

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Agent colors for logging
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

mkdir -p "$PID_DIR"
mkdir -p "$DATA_DIR"
mkdir -p "$DATA_DIR/handoffs"
mkdir -p "$DATA_DIR/projects"
mkdir -p "$DATA_DIR/knowledge"

# Initialize data files from templates if they don't exist
init_data() {
    local files=("inbox.md" "backlog.md" "board.md" "standup.md" "metrics.md")
    for file in "${files[@]}"; do
        if [[ ! -f "$DATA_DIR/$file" && -f "$AGENCY_DIR/$file" ]]; then
            cp "$AGENCY_DIR/$file" "$DATA_DIR/$file"
            echo -e "${GREEN}Initialized $file from template${NC}"
        fi
    done
}

# Ensure data is initialized
init_data

banner() {
    echo -e "${BOLD}${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════════════════════╗"
    echo "║                                                                              ║"
    echo "║                            THE AGENCY v2                                     ║"
    echo "║                                                                              ║"
    echo "║                   Squad Model - Quality-First Design                         ║"
    echo "║                                                                              ║"
    echo "╠══════════════════════════════════════════════════════════════════════════════╣"
    echo "║  PO │ Tech Lead │ Dev α │ Dev β │ Dev γ │ QA │ Reviewer │ DevOps           ║"
    echo "╚══════════════════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo -e "${YELLOW}Workflow:${NC}"
    echo "  Inbox → PO triages → Devs build → QA verifies → Reviewer (optional) → DevOps ships"
    echo ""
    echo -e "${YELLOW}Key features:${NC}"
    echo "  • 3 developers - parallel building capacity"
    echo "  • QA gate - mandatory verification before shipping"
    echo "  • Code review - optional, for complex/sensitive changes"
    echo "  • Async standups - saves ~4 hrs/week interrupt cost"
    echo "  • DORA metrics - tracking what matters"
    echo "  • Stateless agents - token efficient"
    echo ""
    echo -e "${BLUE}Configuration:${NC}"
    echo "  AGENCY_DIR=$AGENCY_DIR"
    echo "  DATA_DIR=$DATA_DIR"
    echo "  PROJECTS_DIR=$PROJECTS_DIR"
    echo "  POLL_INTERVAL=${POLL_INTERVAL}s"
    echo ""
}

start_agent() {
    local agent=$1
    local pid_file="$PID_DIR/${agent}.pid"

    if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
        echo -e "${YELLOW}[$agent]${NC} Already running (PID: $(cat "$pid_file"))"
        return
    fi

    echo -e "${GREEN}[$agent]${NC} Starting..."
    nohup "$AGENCY_DIR/run-agent.sh" "$agent" > /dev/null 2>&1 &
    echo $! > "$pid_file"
    echo -e "${GREEN}[$agent]${NC} Started (PID: $!)"
}

stop_agent() {
    local agent=$1
    local pid_file="$PID_DIR/${agent}.pid"

    if [[ -f "$pid_file" ]]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "${YELLOW}[$agent]${NC} Stopping (PID: $pid)..."
            kill "$pid" 2>/dev/null || true
            rm -f "$pid_file"
            echo -e "${RED}[$agent]${NC} Stopped"
        else
            echo -e "${YELLOW}[$agent]${NC} Not running (stale PID file removed)"
            rm -f "$pid_file"
        fi
    else
        echo -e "${YELLOW}[$agent]${NC} Not running"
    fi
}

status_agent() {
    local agent=$1
    local pid_file="$PID_DIR/${agent}.pid"

    if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
        local pid=$(cat "$pid_file")
        echo -e "${GREEN}●${NC} $agent (PID: $pid)"
        # Try to get status from standup
        local standup_status=$(grep -A 5 "## $agent" "$DATA_DIR/standup.md" 2>/dev/null | grep "Working on:" | head -1 | sed 's/\*\*Working on:\*\* //')
        if [[ -n "$standup_status" && "$standup_status" != "--" ]]; then
            echo -e "  └─ $standup_status"
        fi
    else
        echo -e "${RED}○${NC} $agent (stopped)"
    fi
}

start_all() {
    banner
    echo -e "${BOLD}Starting squad...${NC}"
    echo ""
    for agent in "${AGENTS[@]}"; do
        start_agent "$agent"
    done
    echo ""
    echo -e "${GREEN}Squad is now operational.${NC}"
    echo ""
    echo -e "Add requests to:    ${CYAN}$DATA_DIR/inbox.md${NC}"
    echo -e "Watch backlog:      ${CYAN}$DATA_DIR/backlog.md${NC}"
    echo -e "See standup:        ${CYAN}$DATA_DIR/standup.md${NC}"
    echo -e "Track DORA metrics: ${CYAN}$DATA_DIR/metrics.md${NC}"
    echo -e "Code projects in:   ${CYAN}$PROJECTS_DIR${NC}"
    echo ""
    echo -e "Stop all: $0 stop"
}

stop_all() {
    echo -e "${BOLD}Stopping squad...${NC}"
    echo ""
    for agent in "${AGENTS[@]}"; do
        stop_agent "$agent"
    done
    echo ""
    echo -e "${RED}Squad is now offline.${NC}"
}

show_status() {
    banner
    echo -e "${BOLD}Squad Status:${NC}"
    echo ""
    for agent in "${AGENTS[@]}"; do
        status_agent "$agent"
    done
    echo ""

    # Show DORA metrics summary if available
    if [[ -f "$DATA_DIR/metrics.md" ]]; then
        echo -e "${BOLD}DORA Metrics:${NC}"
        grep -A 4 "## Current Period" "$DATA_DIR/metrics.md" 2>/dev/null | tail -4 || true
        echo ""
    fi
}

run_single() {
    local agent=$1
    if [[ ! -d "$AGENCY_DIR/agents/$agent" ]]; then
        echo -e "${RED}Error: Unknown agent '$agent'${NC}"
        echo "Available: ${AGENTS[*]}"
        exit 1
    fi
    banner
    echo -e "${BOLD}Running $agent in foreground...${NC}"
    echo ""
    exec "$AGENCY_DIR/run-agent.sh" "$agent"
}

# ============================================================================
# WATCH MODE - Live event logging without token usage
# ============================================================================

# Store previous state for change detection (not just checksums)
declare -A PREV_STATE

log_event() {
    local icon="$1"
    local color="$2"
    local message="$3"
    echo -e "${color}$icon ${NC}[$(date '+%H:%M:%S')] $message"
}

# Get all items of a specific state from backlog
get_items() {
    local state="$1"
    grep "## ${state}:" "$DATA_DIR/backlog.md" 2>/dev/null | sort || echo ""
}

# Initialize previous state (silent - don't report existing items)
init_state() {
    PREV_STATE["inbox_new"]=$(grep -c "## NEW:" "$DATA_DIR/inbox.md" 2>/dev/null || echo 0)
    PREV_STATE["backlog_ready"]=$(get_items "READY")
    PREV_STATE["backlog_in_progress"]=$(get_items "IN_PROGRESS")
    PREV_STATE["backlog_done"]=$(get_items "DONE")
    PREV_STATE["backlog_qa_testing"]=$(get_items "QA_TESTING")
    PREV_STATE["backlog_qa_passed"]=$(get_items "QA_PASSED")
    PREV_STATE["backlog_qa_failed"]=$(get_items "QA_FAILED")
    PREV_STATE["backlog_reviewing"]=$(get_items "REVIEWING")
    PREV_STATE["backlog_reviewed"]=$(get_items "REVIEWED")
    PREV_STATE["backlog_shipped"]=$(get_items "SHIPPED")
    PREV_STATE["standup_md5"]=$(md5sum "$DATA_DIR/standup.md" 2>/dev/null | cut -d' ' -f1 || echo "none")
    PREV_STATE["handoffs"]=$(ls "$DATA_DIR/handoffs/"*.md 2>/dev/null | grep -v gitkeep | sort || echo "")
}

check_inbox_changes() {
    local new_count=$(grep -c "## NEW:" "$DATA_DIR/inbox.md" 2>/dev/null || echo 0)
    local prev_count="${PREV_STATE["inbox_new"]}"

    if [[ "$new_count" -gt "$prev_count" ]]; then
        local diff=$((new_count - prev_count))
        log_event "📥" "$MAGENTA" "Inbox: $diff new request(s) added ($new_count total)"
    fi
    PREV_STATE["inbox_new"]="$new_count"
}

# Report only NEW items in a state (items that weren't there before)
check_state_changes() {
    local state="$1"
    local icon="$2"
    local color="$3"
    local message="$4"
    local key="backlog_$(echo "$state" | tr '[:upper:]' '[:lower:]' | tr '-' '_')"

    local current=$(get_items "$state")
    local previous="${PREV_STATE[$key]}"

    # Find new items (in current but not in previous)
    if [[ "$current" != "$previous" ]]; then
        while IFS= read -r line; do
            [[ -z "$line" ]] && continue
            if ! echo "$previous" | grep -qF "$line"; then
                local task=$(echo "$line" | sed "s/## ${state}: //")
                log_event "$icon" "$color" "$message: $task"
            fi
        done <<< "$current"
        PREV_STATE[$key]="$current"
    fi
}

check_backlog_changes() {
    check_state_changes "IN_PROGRESS" "🔨" "$GREEN" "Work started"
    check_state_changes "DONE" "✅" "$GREEN" "Dev completed"
    check_state_changes "QA_TESTING" "🔍" "$YELLOW" "QA testing"
    check_state_changes "QA_PASSED" "✓ " "$YELLOW" "QA passed"
    check_state_changes "QA_FAILED" "✗ " "$RED" "QA FAILED"
    check_state_changes "REVIEWING" "📖" "$MAGENTA" "Reviewing"
    check_state_changes "REVIEWED" "✓ " "$MAGENTA" "Review approved"
    check_state_changes "SHIPPED" "🚀" "$BOLD" "SHIPPED"

    # Ready count (just show if changed)
    local ready_count=$(grep -c "## READY:" "$DATA_DIR/backlog.md" 2>/dev/null || echo 0)
    local prev_ready="${PREV_STATE["backlog_ready_count"]:-0}"
    if [[ "$ready_count" -gt "$prev_ready" ]]; then
        log_event "📋" "$YELLOW" "Backlog: $ready_count item(s) ready for claiming"
    fi
    PREV_STATE["backlog_ready_count"]="$ready_count"
}

check_standup_changes() {
    local new_md5=$(md5sum "$DATA_DIR/standup.md" 2>/dev/null | cut -d' ' -f1 || echo "none")
    local prev_md5="${PREV_STATE["standup_md5"]}"

    if [[ "$new_md5" != "$prev_md5" ]]; then
        # Only report blockers (these are always important)
        local blockers=$(grep "BLOCKED:" "$DATA_DIR/standup.md" 2>/dev/null || echo "")
        local prev_blockers="${PREV_STATE["standup_blockers"]:-}"

        if [[ -n "$blockers" && "$blockers" != "$prev_blockers" ]]; then
            while IFS= read -r line; do
                [[ -z "$line" ]] && continue
                if ! echo "$prev_blockers" | grep -qF "$line"; then
                    log_event "🚫" "$RED" "$line"
                fi
            done <<< "$blockers"
        fi
        PREV_STATE["standup_blockers"]="$blockers"
        PREV_STATE["standup_md5"]="$new_md5"
    fi
}

check_handoffs() {
    local current=$(ls "$DATA_DIR/handoffs/"*.md 2>/dev/null | grep -v gitkeep | sort || echo "")
    local previous="${PREV_STATE["handoffs"]}"

    if [[ "$current" != "$previous" ]]; then
        # Find new handoff files
        while IFS= read -r filepath; do
            [[ -z "$filepath" ]] && continue
            if ! echo "$previous" | grep -qF "$filepath"; then
                local basename=$(basename "$filepath")
                log_event "📨" "$BLUE" "Handoff: $basename"
            fi
        done <<< "$current"
        PREV_STATE["handoffs"]="$current"
    fi
}

watch_loop() {
    banner
    echo -e "${BOLD}Live Activity Log${NC} (Ctrl+C to stop)"
    echo -e "${YELLOW}Watching for changes... (only new events shown)${NC}"
    echo ""
    echo "─────────────────────────────────────────────────────────────"

    init_state

    while true; do
        check_inbox_changes
        check_backlog_changes
        check_standup_changes
        check_handoffs
        sleep 2
    done
}

# ============================================================================

usage() {
    banner
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  start           Start all agents in background"
    echo "  stop            Stop all agents"
    echo "  watch           Live activity log (no token usage)"
    echo "  status          Show agent status and DORA metrics"
    echo "  <agent-name>    Run single agent in foreground"
    echo ""
    echo "Agents: ${AGENTS[*]}"
    echo ""
    echo "Quick start:"
    echo "  1. Add a request to: $DATA_DIR/inbox.md"
    echo "  2. Run: $0 start"
    echo "  3. Run: $0 watch   # See live activity"
    echo ""
}

case "${1:-start}" in
    start)
        start_all
        ;;
    stop)
        stop_all
        ;;
    watch)
        trap 'echo ""; echo -e "${YELLOW}Watch stopped.${NC}"; exit 0' INT TERM
        watch_loop
        ;;
    status)
        show_status
        ;;
    help|--help|-h)
        usage
        ;;
    product-owner|tech-lead|dev-alpha|dev-beta|dev-gamma|qa|reviewer|devops)
        run_single "$1"
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        usage
        exit 1
        ;;
esac
