# The Agency v2: Squad Model

An autonomous multi-agent development team powered by Claude Code - with quality gates to ensure nothing ships broken.

## Overview

The Agency is a framework for running multiple AI agents as a coordinated software development team. Each agent has a specialized role (Product Owner, Tech Lead, Developers, QA, Reviewer, DevOps) and they communicate through shared markdown files - enabling full observability and human intervention at any point.

**Key Features:**
- **Quality-first** - Mandatory QA gate verifies work before shipping
- **Autonomous operation** - Agents poll for work and execute independently
- **Human-readable state** - All coordination happens via markdown files you can read/edit
- **Token efficient** - Stateless agents spawn fresh for each task, no accumulated context
- **Git-friendly** - Templates tracked in git, runtime state gitignored

## Requirements

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- Bash shell (Linux/macOS/WSL)
- Git (optional, for version control)

## Quick Start

```bash
# Clone the repository
git clone https://github.com/forever8896/agency.git
cd agency

# Initialize the data directory (creates agency/data/ with templates)
./agency.sh status

# Add your first request to the inbox
cat >> agency/data/inbox.md << 'EOF'

## NEW: Build a simple CLI todo app
**Priority:** high
**Description:** Command-line todo app with add, list, complete, delete
**Context:** Use Python, keep it simple
EOF

# Start the squad
./agency.sh start

# Watch live activity (no token usage)
./agency.sh watch
```

## How It Works

### File Structure

```
agency/
├── inbox.md              # Template: request format documentation
├── backlog.md            # Template: workflow documentation
├── board.md              # Template: kanban structure
├── standup.md            # Template: standup format
├── metrics.md            # Template: DORA metrics explanation
│
├── agency/data/          # Runtime state (gitignored)
│   ├── inbox.md          # Active requests
│   ├── backlog.md        # Work items in progress
│   ├── board.md          # Current kanban state
│   ├── standup.md        # Agent status updates
│   ├── metrics.md        # Tracked metrics
│   ├── handoffs/         # Inter-agent communication
│   ├── projects/         # Project specifications
│   └── knowledge/        # Shared knowledge base
│
├── agents/               # Agent definitions (AGENT.md prompts)
│   ├── product-owner/
│   ├── tech-lead/
│   ├── dev-alpha/
│   ├── dev-beta/
│   ├── dev-gamma/
│   ├── qa/
│   ├── reviewer/
│   └── devops/
│
├── agency.sh             # Main orchestrator
└── run-agent.sh          # Individual agent runner
```

### Templates vs Runtime Data

The Agency separates **templates** (tracked in git) from **runtime data** (gitignored):

| Location | Purpose | Git Status |
|----------|---------|------------|
| `inbox.md` | Template showing request format | Tracked |
| `agency/data/inbox.md` | Your actual requests | Ignored |
| `backlog.md` | Template showing workflow | Tracked |
| `agency/data/backlog.md` | Your actual work items | Ignored |

**On first run**, templates are automatically copied to `agency/data/` if no data exists. This means:
- New users get clean templates with documentation
- Your work state persists across sessions
- Git stays clean - no accidental commits of work-in-progress

### Workflow

```
1. You add request    →  agency/data/inbox.md (## NEW:)
2. PO triages         →  agency/data/backlog.md (## READY:)
3. Dev claims work    →  ## IN_PROGRESS: @dev-alpha
4. Dev completes      →  ## DONE: @dev-alpha
5. QA verifies        →  ## QA_PASSED: @qa  (or ## QA_FAILED:)
6. Reviewer (if req)  →  ## REVIEWED: @reviewer
7. DevOps deploys     →  ## SHIPPED:
```

Work items flow through states via markdown headers:
- `## NEW:` - Fresh request in inbox
- `## TRIAGED:` - PO has reviewed and added context
- `## READY:` - In backlog, available for claiming
- `## IN_PROGRESS: @agent` - Being worked on
- `## DONE: @agent` - Completed, awaiting QA
- `## QA_TESTING: @qa` - Being verified by QA
- `## QA_PASSED: @qa` - Verified working
- `## QA_FAILED: @qa` - Failed verification (returns to dev)
- `## REVIEWING: @reviewer` - Under code review
- `## REVIEWED: @reviewer` - Code review approved
- `## SHIPPED:` - Live in production

## Configuration

Configure via environment variables:

```bash
# Agency files location (default: script directory)
export AGENCY_DIR=~/path/to/agency

# Runtime data location (default: $AGENCY_DIR/agency/data)
export DATA_DIR=~/path/to/data

# Where agents create code projects (default: ~/projects)
export PROJECTS_DIR=~/code

# Polling interval in seconds (default: 30)
export POLL_INTERVAL=60

# Start with custom config
./agency.sh start
```

### Obsidian Integration

Point `AGENCY_DIR` to your Obsidian vault for seamless note-taking integration:

```bash
AGENCY_DIR=~/obsidian/Agency ./agency.sh start
```

## Commands

```bash
./agency.sh start       # Start all agents in background
./agency.sh stop        # Stop all agents
./agency.sh status      # Show agent status and DORA metrics
./agency.sh watch       # Live activity log (no token usage)
./agency.sh <agent>     # Run single agent in foreground (for debugging)
```

Available agents: `product-owner`, `tech-lead`, `dev-alpha`, `dev-beta`, `dev-gamma`, `qa`, `reviewer`, `devops`

## The Squad

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           THE AGENCY v2                                  │
│                    Squad Model - Quality First                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────┐                                                       │
│   │ Product     │─── Triages inbox, defines acceptance                  │
│   │ Owner       │    criteria, prioritizes backlog                      │
│   └─────────────┘                                                       │
│          │                                                              │
│          ▼                                                              │
│   ┌─────────────┐                                                       │
│   │ Tech Lead   │─── Architecture, unblocks devs,                       │
│   │             │    CAN ALSO CODE (playing coach)                      │
│   └─────────────┘                                                       │
│          │                                                              │
│    ┌─────┼─────┐                                                        │
│    ▼     ▼     ▼                                                        │
│ ┌─────┐┌─────┐┌─────┐                                                   │
│ │Dev α││Dev β││Dev γ│─── Parallel builders, claim work directly         │
│ └─────┘└─────┘└─────┘                                                   │
│    │     │     │                                                        │
│    └─────┼─────┘                                                        │
│          │                                                              │
│          ▼                                                              │
│   ┌─────────────┐                                                       │
│   │     QA      │─── MANDATORY: Verifies work actually works            │
│   └─────────────┘    before shipping (catches broken code)              │
│          │                                                              │
│          ├────────────────────┐                                         │
│          ▼                    ▼ (if Review Required)                    │
│   ┌─────────────┐      ┌─────────────┐                                  │
│   │   DevOps    │      │  Reviewer   │─── Code quality, security,       │
│   └─────────────┘      └─────────────┘    patterns (optional)           │
│          │                    │                                         │
│          ◄────────────────────┘                                         │
│          │                                                              │
│          ▼                                                              │
│      [SHIPPED]─── Deployed to production                                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Observability

Three files to monitor your squad:

| File | What to Watch |
|------|---------------|
| `agency/data/standup.md` | Real-time agent status, blockers |
| `agency/data/backlog.md` | Work states: Ready → In Progress → Done |
| `agency/data/metrics.md` | DORA metrics: deployment frequency, lead time |

Use watch mode for live updates without token usage:
```bash
./agency.sh watch
```

## Research Background

### Design Decisions

| Challenge | Approach | Solution |
|-----------|----------|----------|
| 1 developer bottleneck | More builders = more throughput | 3 developers + tech lead who can code |
| 4 handoffs per task | Handoffs are "silent killers" | Direct claiming, minimal handoffs |
| Broken code shipping | Quality gates catch issues early | Mandatory QA verification |
| Code quality variance | Review catches patterns/security | Optional code review for complex changes |
| No real standups | Async saves ~4 hrs/week | Real async standup with blockers |
| No metrics | DORA metrics correlate with performance | Built-in DORA tracking |

### Why QA is Mandatory

While some research suggests eliminating QA gates, in practice with AI agents:
- Agents can miss edge cases during self-testing
- "It works on my machine" happens with AI too
- A quick verification prevents shipping broken code
- Failed QA loops back to the dev who built it (ownership preserved)

QA is lightweight - verify it works, not exhaustive testing.

### Research Sources

- [DORA State of DevOps Report](https://dora.dev/research/) - 10 years, 32,000+ professionals
- [Spotify Squad Model](https://engineering.atspotify.com/) - Cross-functional autonomous teams
- [Amazon Two-Pizza Teams](https://www.thesandreckoner.co.uk/how-google-amazon-and-spotify-set-up-their-teams-for-success/) - Max 7 people with end-to-end ownership
- [Handoffs Research](https://www.scrum.org/resources/blog/why-handoffs-are-killing-your-agility) - Each handoff is a failure point
- [Async Standup Research](https://www.parabol.co/blog/virtual-standups-vs-async-standups/) - 23 min focus recovery per interrupt

### DORA Metrics

The Agency tracks the four key metrics that correlate with high-performing teams:

| Metric | Target | Description |
|--------|--------|-------------|
| Deployment Frequency | Daily | How often code ships to production |
| Lead Time | < 1 day | Time from commit to production |
| Change Failure Rate | < 15% | % of deployments causing issues |
| MTTR | < 1 hour | Time to recover from incidents |

## Advanced Usage

### Adding Custom Agents

1. Create a directory under `agents/`:
   ```bash
   mkdir -p agents/my-agent
   ```

2. Create `AGENT.md` with the agent's prompt:
   ```markdown
   # My Agent

   You are a specialized agent that...

   ## Responsibilities
   - Task 1
   - Task 2

   ## Workflow
   1. Check for work in...
   2. Process and update...
   ```

3. Add to `AGENTS` array in `agency.sh`:
   ```bash
   AGENTS=("product-owner" "tech-lead" ... "my-agent")
   ```

### Token Efficiency

Agents are designed to be stateless and token-efficient:

- **One task, one session** - Agents spawn fresh for each task
- **Minimal context** - Only relevant files are read
- **Exit when done** - No idle polling inside Claude sessions
- **Watch mode** - Monitor activity without using tokens

### Debugging

Run a single agent in foreground to see its output:

```bash
./agency.sh dev-alpha
```

Check agent logs:
```bash
# Agents run via nohup, check standup.md for status
cat agency/data/standup.md
```

## Philosophy

> "Speed and stability are not tradeoffs. Elite teams excel at both." — DORA Research

> "Handoffs are a silent killer in software development." — Scrum.org

> "No team should be set up that cannot be fed by two pizzas." — Jeff Bezos

The Agency is an experiment in applying organizational research to AI agents. The goal is not just to build software, but to observe how different team structures affect autonomous agent performance.

## Contributing

Contributions welcome! Areas of interest:
- New agent roles
- Alternative team structures
- Metrics and observability
- Integration with other AI tools

## License

MIT - do whatever you want with this.

## Credits

- Research: DORA, Spotify Engineering, Amazon/Google team structure studies
- Original concept: [Denislav Gavrilov](https://x.com/kuberdenis)
