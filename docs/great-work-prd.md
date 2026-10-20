# The Great Work — Hermetic Ontology PRD

> **Status:** Draft v1
> **Scope:** Web edition (the core experience surface)
> **One-liner:** A unified hermetic spine — 3 planes × 7 alchemical stages — that turns Starchild's existing parts into one coherent engine of soul growth.
> **Prerequisite reading:** `docs/web-app-prd.md`, `AGENTS.md`, `src-tauri/core/src/ai.rs`, `src-tauri/core/src/game.rs`, `src-tauri/core/src/quest.rs`, `src-tauri/core/src/knowing.rs`, `src/components/SkillTree.tsx`

---

## 1. Problem — strong pieces, no spine

Today's Starchild has: a preferential reality north star, a 7-phase conversation arc, 7 knowing dimensions, 3 quest categories, an SVG skill tree, and a creature with hunger/mood/XP. Each piece is good alone. **They don't compound.** Specifically:

- The 7 knowing dimensions are a flat list — they don't relate to each other or to the preferential reality.
- Quests are 3 arbitrary buckets (Body/Mind/Spirit) — not connected to which dimension is *blocking* the user.
- The conversation arc is a *temporal* loop (one chat), not a *developmental* loop (the human growing over weeks).
- The skill tree visualizes growth but doesn't *steer* it.
- The creature is decorative — hunger/mood/level are arbitrary, not a mirror of the user's inner state.

The AI does nice conversations, but there's no spine saying *"here is who you are, here is who you're becoming, here is the next step."*

**Result:** conversations feel good in the moment but don't accumulate into a coherent journey. The user returns tomorrow and the AI has no memory of *where they are in their growth* — only a pile of facts.

## 2. The fix — hermeticism is the spine

Hermeticism gives us a developmental ontology — a map of what a human *is* and how a human *grows* — that can unify every mechanic already built. Seven alchemical stages (Calcination → Dissolution → Separation → Conjunction → Fermentation → Distillation → Coagulation) describe how any real transformation happens. Three planes (Body / Mind / Spirit) describe *where* the work happens. Together they form a 21-cell grid: a coordinate system for the soul.

Every existing piece hooks into one coordinate:

- **Preferential reality** = the Philosopher's Stone — the fixed north star every cell serves.
- **Knowing dimensions** = the material each stage works on.
- **Conversation arc** = the micro-loop, informed by the user's macro position.
- **Quests** = operations on a specific cell — offered because that cell is ripe.
- **Skill tree** = the Vessel — 3 pillars × 7 rings, cells light up as worked.
- **Creature** = the Homunculus — its state derived from the user's Great Work position.

The AI's private ontology is hermetic; the user's vocabulary stays human. They experience an AI that uncannily knows *what kind of work they need next* — not a lesson in alchemy.

## 3. Principles

- **Hermeticism is the AI's private ontology — never the user's vocabulary.** The user never sees the word "Calcination." They experience the right kind of work at the right time. The UI speaks human; the prompt layer thinks hermetic.
- **One core, two shells — still.** The entire ontology lives in `src-tauri/core/src/opus.rs` (pure Rust → native + WASM). Edits reach both shells automatically. No platform-specific logic forks.
- **One map, two timescales.** The macro arc spans weeks (persisted `GreatWorkPosition`). The micro arc is one conversation, informed by the macro position.
- **Stage advancement requires evidence — not chat turns.** A conversation can enter at any stage, but the macro position only advances on real events (a completed quest, a crystallized insight, a deepened knowing dimension). This keeps the macro arc meaningful.
- **The grid is a coordinate system, not a content database.** Not every cell needs pre-written content. The AI generates the operation for the ripe cell on demand. The grid says *where* we are; the AI says *what to do there*.
- **No rebuild — reframe.** Preferential reality, the conversation arc, skill tree, creature, knowing-as-structured-facts: all preserved. Reframed, not rewritten.

## 4. The ontology — what the AI thinks in

### 4.1 The three planes (vertical — where)

| Plane | Key | What it governs | Color |
|---|---|---|---|
| Body | `body` | Physical relationship to the world — energy, embodiment, environment, movement, sensory experience | `#a8d8b8` (mint) |
| Mind | `mind` | Cognitive relationship — thinking, deciding, creating, avoiding, rationalizing | `#e8d8a8` (gold) |
| Spirit | `spirit` | Meaning relationship — values, connection, inner life, presence, purpose | `#b8a0d8` (lavender) |

These map directly onto the existing `VALID_CATEGORIES` in `quest.rs` (`body`, `mind`, `spirit`) — same names, same colors. No change to the data shape.

### 4.2 The seven stages (horizontal — what kind of work)

| Stage | Key | What happens | What it feels like | Conversation arc affinity |
|---|---|---|---|---|
| Calcination | `calcination` | Confrontation with the false — structures that aren't actually yours. The fire burns away inherited identity. | Discomfort, defensiveness, sometimes relief | `arrive` / `dig` (early) |
| Dissolution | `dissolution` | Staying in the void after the false burns. Not rushing to rebuild. Letting the old self dissolve. | Groundlessness, grief, sometimes freedom | `dig` / `reframe` |
| Separation | `separation` | Sorting what's left: this is mine, this was imposed. Discernment. | Clarity mixed with mourning | `reframe` / `explore` |
| Conjunction | `conjunction` | Reassembly of the genuine self. Acting from a new center — wobbly at first. | Tentative, electric, vulnerable | `crystallize` / `quest` |
| Fermentation | `fermentation` | The new self begins to live. Tested against reality. Organic, unpredictable. | Alive, sometimes chaotic | `explore` / `release` |
| Distillation | `distillation` | Concentration through repetition. Impurities release. Refinement. | Quieter, steadier, more confident | `dig` (deep) / `reframe` |
| Coagulation | `coagulation` | The self solidifies — set, not rigid. The realized person. The Stone is lived. | Peace, authority, presence | `release` |

### 4.3 The cell (the coordinate)

A cell is a `(plane, stage)` pair. There are 21 total. Every quest, every insight, every skill-tree node belongs to exactly one cell.

```rust
pub struct Cell {
    pub plane: Plane,
    pub stage: Stage,
}
```

### 4.4 Stage ↔ knowing mapping

Each stage works on specific knowing dimensions. This is how the AI knows what to look for at each stage.

| Stage | Knowing dimensions active | What the AI tracks |
|---|---|---|
| Calcination | Fears, ThinkingPatterns | What's burning. What false structures exist. How the person rationalizes them. |
| Dissolution | CoreValues, Desires | What survives the fire. What wants to emerge. What remains when nothing is left. |
| Separation | Relationships, GrowthEdges | Whose voices live inside you. Which edges are you sorting at. |
| Conjunction | CoreValues, Desires | The new self being assembled from genuine material. |
| Fermentation | LifeSituation | How the new self meets actual conditions. Consequences of new choices. |
| Distillation | GrowthEdges (matured) | What was once an edge and is now familiar ground. Inconsistencies still present. |
| Coagulation | All seven | Integration — the whole person, not just one dimension. |

This maps onto the existing `KnowingCategory` enum in `knowing.rs` (`CoreValues`, `Desires`, `Fears`, `ThinkingPatterns`, `Relationships`, `LifeSituation`, `GrowthEdges`) — no new dimensions needed.

## 5. The Great Work Position — the macro state

The user's position on the Great Work — persisted across sessions. This is the spine that was missing.

### 5.1 Data shape

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GreatWorkPosition {
    /// The user's preferential reality (the Stone) — set once at onboarding.
    pub preferential_reality: Option<String>,

    /// One entry per plane. Tracks stage + evidence.
    pub planes: [PlanePosition; 3],

    /// Which cell is most alive right now — the one to work on.
    pub active_cell: Option<Cell>,

    /// Overall progress: how many cells have been worked across all planes.
    pub total_cells_worked: usize,

    /// When the position was last advanced.
    pub last_advanced_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanePosition {
    pub plane: Plane,
    pub stage: Stage,
    /// Cells worked on this plane so far (each is a (stage) tuple)
    pub cells_worked: Vec<Stage>,
    /// Evidence supporting advancement: completed quests, crystallized insights, deepened knowing dims.
    pub evidence: Vec<Evidence>,
    /// Whether this plane is stuck — same stage for too long without progress.
    pub stuck: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Evidence {
    QuestCompleted { cell: Cell, quest_title: String },
    InsightCrystallized { cell: Cell, insight: String },
    KnowingDeepened { dimension: String, depth: usize },
}
```

### 5.2 What determines `active_cell`

The function that decides which cell to work on next — the single most important piece of AI logic:

1. **Blocked planes take priority** — if a plane is stuck (same stage for too long without progress), surface it.
2. **Least-worked planes take priority** — balance across planes. A person who's done all their work on Mind but none on Body needs Body attention.
3. **Within a plane, advance to the next stage** unless current stage evidence is incomplete.
4. **If all planes are advanced past Conjunction**, the user is in deep territory — let them choose what to work on next.

### 5.3 What advances the macro position

Only real events move the macro. Not chat turns.

- A **quest completed** on a specific cell → adds evidence to that cell's plane position.
- A **knowing dimension deepened** (new facts added to the active dimension) → adds evidence.
- An **insight crystallized** during conversation → adds evidence.

When enough evidence accumulates for a stage on a plane, the stage advances. This is slow by design — the macro arc is meant to span weeks.

## 6. How each existing piece hooks in

### 6.1 The conversation arc (unchanged detector, richer intent)

The existing 7-phase detector (`PhaseDetector` in `ai.rs`) keeps working exactly as-is. It detects the *micro* phase from message history. What changes is what the AI *does* with that phase:

- The prompt builder gets one new layer: **the Great Work layer** (see §7). It tells the AI what cell is active, what stage it's working on, what knowing dimensions matter for that stage, and what evidence exists.
- The micro phase is still useful for format control (crystallize must end with ✦, quest must be offered as "i have a quest for you"), but the *intent* behind the phase is now informed by the macro position.

**No structural change to `ai.rs`'s phase logic.** The change is purely additive: one new layer in the prompt builder.

### 6.2 The prompt builder (one new layer)

Current: 11 layers (re-centering → identity → examples → emotional state → personality → knowing → quests → preferential reality → arc → quest generation → rules).

New: **12 layers** — insert the Great Work layer between Layer 8 (Preferential Reality) and Layer 9 (Conversation Arc). The new layer tells the AI:

```
THE GREAT WORK — WHERE YOUR HUMAN IS IN THEIR JOURNEY:

Active cell: {plane} × {stage}
What this stage does: {one sentence describing the stage's purpose}
What this stage works on: {which knowing dimensions matter}
Evidence accumulated: {what the user has already done}
Whether this plane is stuck: {yes/no}

YOUR JOB IN THIS CONVERSATION:
- If the user is in Calcination: name what's burning. Don't rush to rebuild.
- If the user is in Dissolution: hold the void. Don't fill it with advice.
- If the user is in Separation: help them sort. Use your knowing to hold up contradictions.
- If the user is in Conjunction: witness the new self emerging. Quests become concrete here.
- If the user is in Fermentation: ask what happened. What did they learn? What surprised them?
- If the user is in Distillation: refine. Point out where the new self is still inconsistent.
- If the user is in Coagulation: celebrate genuinely. Then ask: what's next?

The macro position is YOUR PRIVATE MAP. The user never sees the word "Calcination" or "alchemical stage."
```

### 6.3 Quest generation — operations on cells

Current: quests are categorized into Body/Mind/Spirit. Generated mid-conversation based on whatever topic came up.

New: quests are generated for the **active cell** — the specific (plane, stage) pair the user is working on. The quest's stage determines what kind of quest it is:

- **Calcination quests** burn away something false (e.g., "spend 30 minutes without your phone — notice what surfaces")
- **Dissolution quests** sit in the void (e.g., "do nothing for 20 minutes. write down what you feel when nothing demands your attention.")
- **Conjunction quests** incarnate the new self (e.g., "make one pot with the intention of giving it away.")
- **Fermentation quests** test the new self in the world (e.g., "tell one person what you actually want.")
- **Distillation quests** repeat and refine (e.g., "make the same pot every day for a week. notice what changes.")

**Implementation:** Add a `stage` field to the `ExtractedQuest` struct in `quest.rs`. Update the extraction prompt to include the stage. Update the fallback to use the active cell's stage. Update normalization to clamp the stage to a valid value.

### 6.4 The Skill Tree — the Vessel

Current: vertical SVG tree with 3 branches (Body/Mind/Spirit) and quest nodes arranged by insertion order. No notion of tiers or stages.

New: **3 pillars × 7 rings** — each cell is a node on the grid. The Stone sits at the crown. Cells light up as they're worked through.

**Implementation details:**
- Keep the same SVG structure (`SkillTree.tsx`) but restructure it to render 21 cells instead of 3 branches of variable-length quest lists.
- Each cell shows whether it's `worked`, `ripe`, `active`, or `unexplored`.
- Cells light up progressively: completed quests fill them in.
- The active cell has a subtle pulse animation.
- Quests still appear on the tree, but they're now positioned by their cell coordinates instead of array order.

### 6.5 The Creature — the Homunculus

Current: hunger decays at 2 points/hour, mood is derived from hunger, level is derived from XP. Energy is inert (starts at 100, never changes). Bond is monotonic (only increases). Three mood variants (`Proud`, `Disappointed`, `Fierce`) exist but are unreachable.

New: creature state is derived from the user's Great Work position.

**What changes:**
- `hunger` becomes the **plane alignment score** — how well-balanced the user is across all three planes. If one plane is neglected, the creature hungers specifically for that plane.
- `mood` becomes the **stage health** — derived from whether the user is stuck in a stage or advancing smoothly. Stuck → `Fierce` or `Restless`. Advancing → `Happy` or `Proud`. Stuck → `Disappointed` if stuck for too long.
- `energy` becomes the **alignment between actual work and the preferential reality** — high when the user's actions align with their stated north star, low when they drift away from it.
- `bond` keeps its current meaning but is now derived from accumulated evidence across all planes (not just message count).
- `level` tracks overall progress across all planes.

**Implementation:** Add a new function `derive_state_from_position(pos: &GreatWorkPosition) -> StarchildState` to `game.rs`. The existing `feed()` / `add_xp()` / `apply_hunger_decay()` primitives stay available for backward compat with desktop.

### 6.6 Knowing — unchanged but enriched

Current: 7 knowing dimensions, each a flat list of facts. Stored in IndexedDB `knowing` store.

New: same 7 dimensions, but now the AI can reason about them in terms of stages. The mapping in §4.4 tells the AI which dimensions matter for each stage. This is purely a prompt-layer change — no change to knowing data structures.

## 7. Build plan

### Phase A — The opus module (pure Rust)

**Files:**
- New: `src-tauri/core/src/opus.rs` — the entire ontology.
- Modified: `src-tauri/core/src/lib.rs` — add `pub mod opus;`

**Contents:**
- `Plane` enum (Body, Mind, Spirit) with `as_str()`, `from_str()`, `ALL`, `color()`.
- `Stage` enum (Calcination → Coagulation) with `as_str()`, `from_str()`, `ALL`, `description()`, `knowing_dimensions()`.
- `Cell` struct (plane, stage).
- `GreatWorkPosition` struct (as above).
- `PlanePosition` struct.
- `Evidence` enum.
- `GreatWorkPosition::new()` — fresh position with no plane selected.
- `GreatWorkPosition::activate_cell(plane, stage)` — set the active cell.
- `GreatWorkPosition::advance_stage(plane)` — advance the stage on a plane based on accumulated evidence.
- `GreatWorkPosition::add_evidence(evidence)` — record evidence.
- `GreatWorkPosition::is_stuck(plane)` — return whether a plane has been in the same stage too long without progress.
- `GreatWorkPosition::derive_state_from_position() -> StarchildState` — creature state derivation.
- `GreatWorkPosition::to_prompt_fragment()` — render the position as a prompt fragment.
- Tests for all of the above.

**Constraints:** No imports beyond `serde`, `serde_json`, and the existing `knowing` module. Must compile to native and WASM. Must pass the existing purity guard (`scripts/check-core-purity.sh`).

### Phase B — Prompt layer integration

**Files:**
- Modified: `src-tauri/core/src/ai.rs` — add the Great Work layer between Layer 8 and Layer 9.
- Modified: `tests/e2e/prompt-engine.ts` — mirror the change.

**What changes:**
- `PromptBuilder::build` gains a new optional argument: `great_work_position: Option<&GreatWorkPosition>`.
- If provided, inserts the new layer between Layer 8 and Layer 9.
- If not provided (backward compat), no change.
- Tests verify the new layer renders correctly when a position is provided.

### Phase C — Test infrastructure

**Files:**
- Modified: `tests/e2e/conversation-routes.ts` — add new routes that exercise different stages of the Great Work.
- Modified: `tests/e2e/run.ts` — load positions into the routes.

**New synthetic routes:**
- `calcination-user`: someone whose identity is collapsing, facing a crisis.
- `dissolution-user`: someone in the void, recently having lost something.
- `fermentation-user`: someone whose new self is being tested by reality.
- `distillation-user`: someone whose new self is maturing, facing minor inconsistencies.

**What we measure:** Judge scores per route. Compare baseline (current 11-layer prompt) vs new (12-layer prompt with Great Work position). The hypothesis is that knowing which stage the user is in improves the AI's ability to give the right kind of work.

### Phase D — Skill tree restructure

**Files:**
- Modified: `src/components/SkillTree.tsx` — render as a 3×7 grid with cells colored by stage.

### Phase E — Creature state derivation

**Files:**
- Modified: `src-tauri/core/src/game.rs` — add `derive_state_from_position`.
- Modified: `src/platform/web.ts` — call `derive_state_from_position` after each interaction.

### Phase F — Persistence

**Files:**
- Modified: `web/src/storage.ts` — add a new `great_work` store to IndexedDB (version bump to 3).
- Modified: `src/platform/index.ts` — add `getGreatWorkPosition()` / `setGreatWorkPosition()` to the Platform interface.
- Modified: `src/platform/web.ts` — implement using IndexedDB storage.
- Modified: `src/platform/desktop.ts` — implement using SQLite.

## 8. What stays unchanged

- **The preferential reality north star** — unchanged.
- **The conversation arc phases** — `Arrive`, `Dig`, `Crystallize`, `Explore`, `Reframe`, `Quest`, `Negotiate`, `Proof`, `Release` all stay exactly as they are. Same names, same detection logic.
- **The phase detector** — same heuristic-based detection.
- **The model routing** — same `quick`/`regular`/`deep` tiers.
- **The E2EE setup** — Venice inference runs on `e2ee-glm-4-7-p` unchanged.
- **The export/import format** — `.starchild` files stay compatible. Adding a new store is additive.

## 9. Acceptance criteria

- [ ] `opus.rs` compiles to native and WASM, passes `cargo test` and the purity guard.
- [ ] Prompt builder with the new layer produces sensible output for all 7 stages.
- [ ] Synthetic test routes show that knowing the user's stage improves the judge score compared to the baseline.
- [ ] Skill tree renders as a 3×7 grid showing the user's progress.
- [ ] Creature state reflects the user's Great Work position (neglecting a plane drops the relevant stat).
- [ ] Great Work position persists across sessions (IndexedDB on web).
- [ ] Existing functionality preserved: existing tests pass, conversation quality at least as good as baseline.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Stage advancement too fast or too slow | Tune evidence thresholds. Start with high thresholds (slow advancement) and iterate based on actual usage. |
| The grid feels sparse / confusing | Each cell has a tooltip explaining what that stage does on that plane. Don't pre-populate content — let the AI fill it dynamically. |
| The user never sees the word "Calcination" but the AI doesn't know what to do without it | The prompt layer explicitly says "your human is in a stage of burning away false structures. Name what's burning. Don't rush to rebuild." — gives the AI the intent without the label. |
| Creature state derivation produces unexpected results | Start with conservative mapping. Document the mapping clearly. Add tests. |
| Backward compat with existing data | Additive only — new fields default to None. Existing users don't have a position until they interact with the new system. |

## 11. Open questions

- **How often does `active_cell` change?** Probably once per session at most — otherwise the user feels like they're being pulled around. Maybe every few days.
- **What counts as "stuck" for a plane?** Currently: same stage for too long without progress. Define a threshold — maybe 5 conversations without new evidence.
- **Should we show the user their current stage explicitly?** Currently no — the whole point is that they experience it without knowing the vocabulary. But maybe we could show them a gentle description ("you're in a phase of letting go of what isn't yours") without naming it "Calcination."
- **Should we let users choose their own path?** Probably not — the whole point of the system is that it knows where they are and suggests what's next. But if a user explicitly asks for help with something specific, we can flexibly move them to that cell for that session.

## 12. References

- `src-tauri/core/src/ai.rs` — current prompt builder (11 layers)
- `src-tauri/core/src/game.rs` — current creature state
- `src-tauri/core/src/quest.rs` — current quest system
- `src-tauri/core/src/knowing.rs` — current knowing dimensions
- `src/components/SkillTree.tsx` — current skill tree
- `tests/e2e/run.ts` — current test harness
- `tests/e2e/conversation-routes.ts` — current synthetic users
- `tests/web-e2e/quest-loop.spec.ts` — web Playwright test
