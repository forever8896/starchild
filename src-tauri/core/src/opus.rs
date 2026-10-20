//! The Great Work — hermetic ontology for Starchild's growth engine.
//!
//! A unified spine that connects the existing pieces (preferential reality,
//! knowing dimensions, conversation arc, quests, skill tree, creature) into
//! one coherent developmental model:
//!
//! - **3 planes** (Body / Mind / Spirit) — *where* the work happens
//! - **7 alchemical stages** (Calcination → Coagulation) — *what kind* of work
//! - **21 cells** = (plane × stage) — the coordinate system for the soul
//!
//! Everything here is pure (no IO, no clock, no Tauri/SQLite) so it compiles
//! to native AND wasm32. The single source of truth shared by both shells.

use serde::{Deserialize, Serialize};

use crate::game::{Mood, StarchildState};

// ---------------------------------------------------------------------------
// Plane — the vertical axis (where the work happens)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Plane {
    Body,
    Mind,
    Spirit,
}

impl Plane {
    pub const ALL: &'static [Plane] = &[Self::Body, Self::Mind, Self::Spirit];

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Body => "body",
            Self::Mind => "mind",
            Self::Spirit => "spirit",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "body" => Some(Self::Body),
            "mind" => Some(Self::Mind),
            "spirit" => Some(Self::Spirit),
            _ => None,
        }
    }

    /// Hex color used by the skill tree and quest badges.
    pub fn color(&self) -> &'static str {
        match self {
            Self::Body => "#a8d8b8",
            Self::Mind => "#e8d8a8",
            Self::Spirit => "#b8a0d8",
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            Self::Body => "Body",
            Self::Mind => "Mind",
            Self::Spirit => "Spirit",
        }
    }

    pub fn description(&self) -> &'static str {
        match self {
            Self::Body => {
                "physical relationship to the world — energy, embodiment, environment, movement"
            }
            Self::Mind => {
                "cognitive relationship — thinking, deciding, creating, avoiding, rationalizing"
            }
            Self::Spirit => {
                "meaning relationship — values, connection, inner life, presence, purpose"
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Stage — the horizontal axis (what kind of work)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Stage {
    Calcination,
    Dissolution,
    Separation,
    Conjunction,
    Fermentation,
    Distillation,
    Coagulation,
}

impl Stage {
    pub const ALL: &'static [Stage] = &[
        Self::Calcination,
        Self::Dissolution,
        Self::Separation,
        Self::Conjunction,
        Self::Fermentation,
        Self::Distillation,
        Self::Coagulation,
    ];

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Calcination => "calcination",
            Self::Dissolution => "dissolution",
            Self::Separation => "separation",
            Self::Conjunction => "conjunction",
            Self::Fermentation => "fermentation",
            Self::Distillation => "distillation",
            Self::Coagulation => "coagulation",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "calcination" => Some(Self::Calcination),
            "dissolution" => Some(Self::Dissolution),
            "separation" => Some(Self::Separation),
            "conjunction" => Some(Self::Conjunction),
            "fermentation" => Some(Self::Fermentation),
            "distillation" => Some(Self::Distillation),
            "coagulation" => Some(Self::Coagulation),
            _ => None,
        }
    }

    /// Human-readable description of what this stage does.
    pub fn description(&self) -> &'static str {
        match self {
            Self::Calcination => {
                "confrontation with the false — structures that aren't actually yours. the fire burns away inherited identity."
            }
            Self::Dissolution => {
                "staying in the void after the false burns. not rushing to rebuild. letting the old self dissolve."
            }
            Self::Separation => {
                "sorting what's left: this is mine, this was imposed. discernment."
            }
            Self::Conjunction => {
                "reassembly of the genuine self. acting from a new center — wobbly at first."
            }
            Self::Fermentation => {
                "the new self begins to live. tested against reality. organic, unpredictable."
            }
            Self::Distillation => {
                "concentration through repetition. impurities release. refinement."
            }
            Self::Coagulation => {
                "the self solidifies — set, not rigid. the realized person. the stone is lived."
            }
        }
    }

    /// What it feels like for the human.
    pub fn feeling(&self) -> &'static str {
        match self {
            Self::Calcination => "discomfort, defensiveness, sometimes relief",
            Self::Dissolution => "groundlessness, grief, sometimes freedom",
            Self::Separation => "clarity mixed with mourning",
            Self::Conjunction => "tentative, electric, vulnerable",
            Self::Fermentation => "alive, sometimes chaotic",
            Self::Distillation => "quieter, steadier, more confident",
            Self::Coagulation => "peace, authority, presence",
        }
    }

    /// Which knowing dimensions matter most at this stage.
    pub fn knowing_dimensions(&self) -> &'static [&'static str] {
        match self {
            Self::Calcination => &["fears", "thinking_patterns"],
            Self::Dissolution => &["core_values", "desires"],
            Self::Separation => &["relationships", "growth_edges"],
            Self::Conjunction => &["core_values", "desires"],
            Self::Fermentation => &["life_situation"],
            Self::Distillation => &["growth_edges"],
            Self::Coagulation => &[
                "core_values",
                "desires",
                "fears",
                "thinking_patterns",
                "relationships",
                "life_situation",
                "growth_edges",
            ],
        }
    }

    /// Guidance for the AI on how to approach this stage.
    pub fn ai_guidance(&self) -> &'static str {
        match self {
            Self::Calcination => {
                "name what's burning. don't rush to rebuild. sit in the fire with them."
            }
            Self::Dissolution => {
                "hold the void. don't fill it with advice. mirror what's dissolving."
            }
            Self::Separation => {
                "help them sort. hold up contradictions using what you know."
            }
            Self::Conjunction => {
                "witness the new self emerging. quests become concrete here."
            }
            Self::Fermentation => {
                "ask what happened. what did they learn? what surprised them?"
            }
            Self::Distillation => {
                "refine. point out where the new self is still inconsistent."
            }
            Self::Coagulation => {
                "celebrate genuinely. then ask: what's next? what plane is calling?"
            }
        }
    }

    /// The order of stages (0-indexed).
    pub fn order(&self) -> usize {
        match self {
            Self::Calcination => 0,
            Self::Dissolution => 1,
            Self::Separation => 2,
            Self::Conjunction => 3,
            Self::Fermentation => 4,
            Self::Distillation => 5,
            Self::Coagulation => 6,
        }
    }

    /// The next stage after this one, if any.
    pub fn next(&self) -> Option<Self> {
        match self {
            Self::Calcination => Some(Self::Dissolution),
            Self::Dissolution => Some(Self::Separation),
            Self::Separation => Some(Self::Conjunction),
            Self::Conjunction => Some(Self::Fermentation),
            Self::Fermentation => Some(Self::Distillation),
            Self::Distillation => Some(Self::Coagulation),
            Self::Coagulation => None,
        }
    }

    /// How many evidence items are needed to advance past this stage.
    pub fn evidence_threshold(&self) -> usize {
        match self {
            Self::Calcination => 2,
            Self::Dissolution => 2,
            Self::Separation => 3,
            Self::Conjunction => 3,
            Self::Fermentation => 3,
            Self::Distillation => 4,
            Self::Coagulation => 5,
        }
    }
}

// ---------------------------------------------------------------------------
// Cell — a (plane, stage) coordinate
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Cell {
    pub plane: Plane,
    pub stage: Stage,
}

impl Cell {
    pub fn new(plane: Plane, stage: Stage) -> Self {
        Self { plane, stage }
    }

    /// Human-readable label for the cell (e.g., "Body × Calcination").
    pub fn label(&self) -> String {
        format!("{} × {}", self.plane.label(), self.stage.as_str())
    }
}

// ---------------------------------------------------------------------------
// Evidence — what advances the macro position
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum Evidence {
    QuestCompleted {
        cell: Cell,
        quest_title: String,
    },
    InsightCrystallized {
        cell: Cell,
        insight: String,
    },
    KnowingDeepened {
        dimension: String,
        depth: usize,
    },
}

impl Evidence {
    /// Which cell this evidence belongs to (if any).
    pub fn cell(&self) -> Option<&Cell> {
        match self {
            Self::QuestCompleted { cell, .. } | Self::InsightCrystallized { cell, .. } => Some(cell),
            Self::KnowingDeepened { .. } => None,
        }
    }
}

// ---------------------------------------------------------------------------
// PlanePosition — per-plane tracking
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanePosition {
    pub plane: Plane,
    pub stage: Stage,
    pub cells_worked: Vec<Stage>,
    pub evidence: Vec<Evidence>,
    pub stuck: bool,
}

impl PlanePosition {
    pub fn new(plane: Plane) -> Self {
        Self {
            plane,
            stage: Stage::Calcination,
            cells_worked: Vec::new(),
            evidence: Vec::new(),
            stuck: false,
        }
    }

    /// Count evidence items relevant to the current stage.
    pub fn current_stage_evidence_count(&self) -> usize {
        let target_stage = self.stage;
        self.evidence
            .iter()
            .filter(|e| match e {
                Evidence::QuestCompleted { cell, .. }
                | Evidence::InsightCrystallized { cell, .. } => {
                    cell.stage == target_stage && cell.plane == self.plane
                }
                Evidence::KnowingDeepened { .. } => false,
            })
            .count()
    }

    /// Whether the current stage has enough evidence to advance.
    pub fn can_advance(&self) -> bool {
        self.current_stage_evidence_count() >= self.stage.evidence_threshold()
    }

    /// Advance to the next stage if possible.
    pub fn advance(&mut self) -> bool {
        if let Some(next) = self.stage.next() {
            if self.can_advance() {
                if !self.cells_worked.contains(&self.stage) {
                    self.cells_worked.push(self.stage);
                }
                self.stage = next;
                return true;
            }
        }
        false
    }

    /// Add evidence and mark as stuck if needed.
    pub fn add_evidence(&mut self, evidence: Evidence) {
        self.evidence.push(evidence);
    }

    /// Mark as stuck if no new evidence has been added recently.
    pub fn mark_stuck_if_needed(&mut self, recent_evidence_count: usize) {
        if self.stuck {
            return;
        }
        if self.current_stage_evidence_count() >= self.stage.evidence_threshold() {
            self.stuck = false;
            return;
        }
        // If we've been stuck for a while without progress
        if self.current_stage_evidence_count() == 0 && recent_evidence_count > 5 {
            self.stuck = true;
        }
    }

    pub fn evidence_count(&self) -> usize {
        self.evidence.len()
    }
}

// ---------------------------------------------------------------------------
// GreatWorkPosition — the macro state
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GreatWorkPosition {
    pub preferential_reality: Option<String>,
    pub planes: [PlanePosition; 3],
    pub active_cell: Option<Cell>,
    pub total_cells_worked: usize,
    pub last_advanced_at: Option<String>,
}

impl GreatWorkPosition {
    pub fn new() -> Self {
        Self {
            preferential_reality: None,
            planes: [
                PlanePosition::new(Plane::Body),
                PlanePosition::new(Plane::Mind),
                PlanePosition::new(Plane::Spirit),
            ],
            active_cell: None,
            total_cells_worked: 0,
            last_advanced_at: None,
        }
    }

    pub fn set_preferential_reality(&mut self, pr: String) {
        self.preferential_reality = Some(pr);
    }

    pub fn activate_cell(&mut self, plane: Plane, stage: Stage) {
        self.active_cell = Some(Cell::new(plane, stage));
    }

    /// Get the position for a specific plane.
    pub fn plane_position(&self, plane: Plane) -> &PlanePosition {
        self.planes.iter().find(|p| p.plane == plane).unwrap()
    }

    pub fn plane_position_mut(&mut self, plane: Plane) -> &mut PlanePosition {
        self.planes.iter_mut().find(|p| p.plane == plane).unwrap()
    }

    /// Add evidence to a specific plane.
    pub fn add_evidence(&mut self, evidence: Evidence) {
        let plane = match &evidence {
            Evidence::QuestCompleted { cell, .. } => cell.plane,
            Evidence::InsightCrystallized { cell, .. } => cell.plane,
            Evidence::KnowingDeepened { .. } => {
                // Knowing evidence applies to all planes
                self.planes.iter_mut().for_each(|p| p.evidence.push(evidence.clone()));
                return;
            }
        };
        self.plane_position_mut(plane).add_evidence(evidence);
    }

    /// Advance a plane if it has enough evidence.
    pub fn advance_stage(&mut self, plane: Plane) -> bool {
        let pos = self.plane_position_mut(plane);
        if pos.advance() {
            self.total_cells_worked += 1;
            return true;
        }
        false
    }

    /// Record one piece of evidence and advance any plane it makes ripe.
    ///
    /// The single entry point both shells call so the record→advance rule lives
    /// in exactly one place. Adds the evidence to its plane(s), advances each
    /// affected plane that now clears its threshold, follows the `active_cell`
    /// to the freshest advance, and stamps `last_advanced_at` when anything
    /// moved. Returns the planes that advanced (for celebration/UI).
    pub fn ingest_evidence(&mut self, evidence: Evidence, now_iso: String) -> Vec<Plane> {
        let affected: Vec<Plane> = match &evidence {
            Evidence::QuestCompleted { cell, .. }
            | Evidence::InsightCrystallized { cell, .. } => vec![cell.plane],
            Evidence::KnowingDeepened { .. } => vec![Plane::Body, Plane::Mind, Plane::Spirit],
        };
        self.add_evidence(evidence);
        let mut advanced = Vec::new();
        for plane in affected {
            if self.advance_stage(plane) {
                let new_stage = self.plane_position(plane).stage;
                self.active_cell = Some(Cell::new(plane, new_stage));
                advanced.push(plane);
            }
        }
        if !advanced.is_empty() {
            self.last_advanced_at = Some(now_iso);
        }
        advanced
    }

    /// Check if a plane is stuck.
    pub fn is_stuck(&self, plane: Plane) -> bool {
        self.plane_position(plane).stuck
    }

    /// Determine which cell to work on next.
    ///
    /// Priority:
    /// 1. Blocked planes (stuck) take priority
    /// 2. Least-worked planes take priority
    /// 3. Within a plane, advance to the next stage unless current stage is incomplete
    pub fn determine_active_cell(&self) -> Option<Cell> {
        let mut best_plane: Option<Plane> = None;
        let mut best_score = -1i32;

        for pos in &self.planes {
            let mut score = 0i32;

            // Stuck planes get priority
            if pos.stuck {
                score += 100;
            }

            // Least-worked planes get priority
            let worked = pos.cells_worked.len() as i32;
            score -= worked * 10;

            // Planes closer to the end get less priority (let others catch up)
            let stage_progress = pos.stage.order() as i32;
            score -= stage_progress;

            if score > best_score {
                best_score = score;
                best_plane = Some(pos.plane);
            }
        }

        best_plane.map(|plane| {
            let stage = self.plane_position(plane).stage;
            Cell::new(plane, stage)
        })
    }

    /// Update the active cell based on current positions.
    pub fn update_active_cell(&mut self) {
        self.active_cell = self.determine_active_cell();
    }

    /// Get the active cell's stage description.
    pub fn active_stage_description(&self) -> Option<&'static str> {
        self.active_cell.map(|c| c.stage.description())
    }

    /// Get the active cell's AI guidance.
    pub fn active_ai_guidance(&self) -> Option<&'static str> {
        self.active_cell.map(|c| c.stage.ai_guidance())
    }

    /// Get the active cell's knowing dimensions.
    pub fn active_knowing_dimensions(&self) -> Option<&'static [&'static str]> {
        self.active_cell.map(|c| c.stage.knowing_dimensions())
    }

    /// Render the position as a prompt fragment for the AI.
    ///
    /// This is the core of how the AI learns about the user's current state.
    /// The output is meant to be injected into the prompt builder's Great Work layer.
    pub fn to_prompt_fragment(&self) -> String {
        let Some(cell) = self.active_cell else {
            return String::new();
        };

        let mut parts = Vec::new();

        parts.push(format!(
            "Active cell: {} × {}\n",
            cell.plane.label(),
            cell.stage.as_str()
        ));
        parts.push(format!(
            "What this stage does: {}\n",
            cell.stage.description()
        ));
        parts.push(format!(
            "What it feels like for them: {}\n",
            cell.stage.feeling()
        ));
        parts.push(format!(
            "What this stage works on: {}\n",
            cell.stage
                .knowing_dimensions()
                .join(", ")
        ));

        let plane_pos = self.plane_position(cell.plane);
        let evidence_count = plane_pos.evidence_count();
        let current_stage_evidence = plane_pos.current_stage_evidence_count();
        let threshold = cell.stage.evidence_threshold();

        parts.push(format!(
            "Evidence accumulated: {current_stage_evidence} (need {threshold} to advance)\n",
        ));
        parts.push(format!(
            "Evidence on this plane: {evidence_count} total\n",
        ));

        if plane_pos.stuck {
            parts.push("This plane is stuck — they've been in the same place for too long. Be patient but present.\n".to_string());
        }

        parts.push(format!(
            "YOUR JOB IN THIS CONVERSATION: {}\n",
            cell.stage.ai_guidance()
        ));

        // Add guidance about the macro position
        let mut macro_notes = Vec::new();
        for pos in &self.planes {
            if pos.plane != cell.plane {
                macro_notes.push(format!(
                    "  {}: stage {} ({}, {} evidence)",
                    pos.plane.label(),
                    pos.stage.as_str(),
                    if pos.stuck { "stuck" } else { "active" },
                    pos.evidence_count()
                ));
            }
        }
        if !macro_notes.is_empty() {
            parts.push("Other planes (for context):\n".to_string());
            parts.push(macro_notes.join("\n"));
        }

        parts.join("\n")
    }

    /// Derive the creature's state from the user's Great Work position.
    ///
    /// This replaces the old hunger-decay model. Instead of hunger decaying
    /// passively over time, the creature's state reflects how well the user
    /// is progressing across all planes.
    ///
    /// - `hunger` → plane alignment score: high when balanced, low when neglected
    /// - `mood` → stage health: derived from whether the user is advancing or stuck
    /// - `energy` → alignment with preferential reality: high when work aligns with the stone
    /// - `bond` → accumulated evidence across all planes
    /// - `xp` → accumulated evidence points
    /// - `level` → overall progress across all planes
    pub fn derive_state_from_position(&self, now: chrono::DateTime<chrono::Utc>) -> StarchildState {
        let total_evidence: usize = self.planes.iter().map(|p| p.evidence_count()).sum();
        let total_cells_worked: usize = self.planes.iter().map(|p| p.cells_worked.len()).sum();
        let stuck_count = self.planes.iter().filter(|p| p.stuck).count();

        // Hunger: how well-balanced across all planes
        let mut plane_balance: f64 = 100.0;
        let max_evidence = self.planes.iter().map(|p| p.evidence_count()).max().unwrap_or(0) as f64;
        let min_evidence = self.planes.iter().map(|p| p.evidence_count()).min().unwrap_or(0) as f64;
        if max_evidence > 0.0 {
            let imbalance = (max_evidence - min_evidence) / max_evidence.max(1.0);
            plane_balance = (1.0 - imbalance) * 100.0;
        }
        let hunger = plane_balance.clamp(0.0, 100.0);

        // Energy: alignment with preferential reality
        // Higher when there's evidence of progress toward the stone
        let energy = if self.preferential_reality.is_some() {
            let progress = total_cells_worked as f64 / 21.0;
            let alignment = (100.0 - (stuck_count as f64 * 20.0)).max(0.0);
            (progress * 100.0 + alignment).min(100.0) / 2.0
        } else {
            50.0
        };

        // Bond: derived from accumulated evidence
        let bond = (total_evidence as f64 * 5.0).clamp(0.0, 100.0);

        // XP: accumulated evidence points
        let xp = total_evidence as i64 * 10;

        // Level: derived from total cells worked
        let level = (total_cells_worked as i32) + 1;

        // Mood: derived from stage health
        let mood = if stuck_count >= 2 {
            Mood::Disappointed
        } else if stuck_count >= 1 {
            Mood::Fierce
        } else if self.planes.iter().all(|p| p.stage == Stage::Coagulation) {
            Mood::Proud
        } else if hunger >= 70.0 {
            Mood::Happy
        } else if hunger >= 50.0 {
            Mood::Content
        } else {
            Mood::Restless
        };

        StarchildState {
            hunger,
            mood,
            energy,
            bond,
            xp,
            level,
            last_decay_at: now,
        }
    }

    /// Convenience wrapper that uses `Utc::now()` for the timestamp.
    #[cfg(not(target_arch = "wasm32"))]
    pub fn derive_state(&self) -> StarchildState {
        self.derive_state_from_position(chrono::Utc::now())
    }

    pub fn total_cells_worked(&self) -> usize {
        self.total_cells_worked
    }

    pub fn is_complete(&self) -> bool {
        self.planes.iter().all(|p| p.stage == Stage::Coagulation)
    }
}

impl Default for GreatWorkPosition {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plane_roundtrip() {
        for p in Plane::ALL {
            let s = p.as_str();
            assert_eq!(Plane::from_str(s), Some(*p));
        }
        assert_eq!(Plane::from_str("unknown"), None);
    }

    #[test]
    fn stage_roundtrip() {
        for s in Stage::ALL {
            let str = s.as_str();
            assert_eq!(Stage::from_str(str), Some(*s));
        }
        assert_eq!(Stage::from_str("unknown"), None);
    }

    #[test]
    fn stage_order_and_next() {
        assert_eq!(Stage::Calcination.order(), 0);
        assert_eq!(Stage::Coagulation.order(), 6);
        assert_eq!(Stage::Calcination.next(), Some(Stage::Dissolution));
        assert_eq!(Stage::Coagulation.next(), None);
    }

    #[test]
    fn stage_knowing_dimensions() {
        assert_eq!(Stage::Calcination.knowing_dimensions(), &["fears", "thinking_patterns"]);
        assert_eq!(Stage::Dissolution.knowing_dimensions(), &["core_values", "desires"]);
        assert_eq!(Stage::Coagulation.knowing_dimensions().len(), 7);
    }

    #[test]
    fn cell_label() {
        let cell = Cell::new(Plane::Body, Stage::Calcination);
        assert_eq!(cell.label(), "Body × calcination");
    }

    #[test]
    fn new_position_starts_at_calcination() {
        let pos = GreatWorkPosition::new();
        assert_eq!(pos.planes[0].stage, Stage::Calcination);
        assert_eq!(pos.planes[1].stage, Stage::Calcination);
        assert_eq!(pos.planes[2].stage, Stage::Calcination);
        assert!(pos.active_cell.is_none());
        assert_eq!(pos.total_cells_worked, 0);
    }

    #[test]
    fn add_evidence_to_specific_plane() {
        let mut pos = GreatWorkPosition::new();
        let cell = Cell::new(Plane::Body, Stage::Calcination);
        let evidence = Evidence::QuestCompleted {
            cell,
            quest_title: "test quest".into(),
        };
        pos.add_evidence(evidence);
        assert_eq!(pos.plane_position(Plane::Body).evidence_count(), 1);
        assert_eq!(pos.plane_position(Plane::Mind).evidence_count(), 0);
    }

    #[test]
    fn knowing_evidence_applies_to_all_planes() {
        let mut pos = GreatWorkPosition::new();
        let evidence = Evidence::KnowingDeepened {
            dimension: "fears".into(),
            depth: 3,
        };
        pos.add_evidence(evidence);
        assert_eq!(pos.plane_position(Plane::Body).evidence_count(), 1);
        assert_eq!(pos.plane_position(Plane::Mind).evidence_count(), 1);
        assert_eq!(pos.plane_position(Plane::Spirit).evidence_count(), 1);
    }

    #[test]
    fn can_advance_after_threshold() {
        let mut pos = GreatWorkPosition::new();
        let cell = Cell::new(Plane::Body, Stage::Calcination);

        // Calcination needs 2 pieces of evidence
        pos.add_evidence(Evidence::QuestCompleted { cell, quest_title: "q1".into() });
        assert!(!pos.plane_position(Plane::Body).can_advance());

        pos.add_evidence(Evidence::QuestCompleted { cell, quest_title: "q2".into() });
        assert!(pos.plane_position(Plane::Body).can_advance());
    }

    #[test]
    fn advance_stage_changes_stage() {
        let mut pos = GreatWorkPosition::new();
        let cell = Cell::new(Plane::Body, Stage::Calcination);

        pos.add_evidence(Evidence::QuestCompleted { cell, quest_title: "q1".into() });
        pos.add_evidence(Evidence::QuestCompleted { cell, quest_title: "q2".into() });

        let advanced = pos.advance_stage(Plane::Body);
        assert!(advanced);
        assert_eq!(pos.plane_position(Plane::Body).stage, Stage::Dissolution);
    }

    #[test]
    fn ingest_evidence_records_and_advances() {
        let mut pos = GreatWorkPosition::new();
        let cell = Cell::new(Plane::Body, Stage::Calcination);

        // First piece: recorded, not yet enough to advance.
        let advanced = pos.ingest_evidence(
            Evidence::QuestCompleted { cell, quest_title: "q1".into() },
            "2026-07-03T00:00:00Z".into(),
        );
        assert!(advanced.is_empty());
        assert_eq!(pos.plane_position(Plane::Body).stage, Stage::Calcination);
        assert!(pos.last_advanced_at.is_none());

        // Second piece: clears the threshold → advances Body to Dissolution,
        // stamps the clock, and follows the active cell.
        let advanced = pos.ingest_evidence(
            Evidence::QuestCompleted { cell, quest_title: "q2".into() },
            "2026-07-03T00:01:00Z".into(),
        );
        assert_eq!(advanced, vec![Plane::Body]);
        assert_eq!(pos.plane_position(Plane::Body).stage, Stage::Dissolution);
        assert_eq!(pos.total_cells_worked, 1);
        assert_eq!(pos.last_advanced_at.as_deref(), Some("2026-07-03T00:01:00Z"));
        assert_eq!(pos.active_cell, Some(Cell::new(Plane::Body, Stage::Dissolution)));
    }

    #[test]
    fn determine_active_cell_prefers_least_worked() {
        let mut pos = GreatWorkPosition::new();

        // Add evidence to Body only
        let cell = Cell::new(Plane::Body, Stage::Calcination);
        pos.add_evidence(Evidence::QuestCompleted { cell, quest_title: "q".into() });

        // Active cell should prefer Body since it's least worked
        let active = pos.determine_active_cell();
        assert!(active.is_some());
        assert_eq!(active.unwrap().plane, Plane::Body);
    }

    #[test]
    fn determine_active_cell_prefers_stuck() {
        let mut pos = GreatWorkPosition::new();

        // Make Body stuck
        pos.plane_position_mut(Plane::Body).stuck = true;

        // Add evidence to Mind to make it less likely to be chosen
        let cell = Cell::new(Plane::Mind, Stage::Calcination);
        pos.add_evidence(Evidence::QuestCompleted { cell, quest_title: "q".into() });

        let active = pos.determine_active_cell();
        assert_eq!(active.unwrap().plane, Plane::Body);
    }

    #[test]
    fn prompt_fragment_is_empty_without_active_cell() {
        let pos = GreatWorkPosition::new();
        assert!(pos.to_prompt_fragment().is_empty());
    }

    #[test]
    fn prompt_fragment_contains_stage_info() {
        let mut pos = GreatWorkPosition::new();
        pos.activate_cell(Plane::Mind, Stage::Conjunction);
        let fragment = pos.to_prompt_fragment();
        assert!(fragment.contains("Mind × conjunction"));
        assert!(fragment.contains("conjunction"));
        assert!(fragment.contains("YOUR JOB IN THIS CONVERSATION"));
    }

    #[test]
    fn derive_state_defaults() {
        let pos = GreatWorkPosition::new();
        let now = chrono::Utc::now();
        let state = pos.derive_state_from_position(now);
        assert_eq!(state.level, 1);
        assert_eq!(state.xp, 0);
        assert!(state.bond < 1.0);
    }

    #[test]
    fn derive_state_reflects_progress() {
        let mut pos = GreatWorkPosition::new();
        let cell = Cell::new(Plane::Body, Stage::Calcination);
        pos.add_evidence(Evidence::QuestCompleted { cell, quest_title: "q1".into() });
        pos.add_evidence(Evidence::QuestCompleted { cell, quest_title: "q2".into() });
        pos.advance_stage(Plane::Body);

        let now = chrono::Utc::now();
        let state = pos.derive_state_from_position(now);

        assert!(state.xp > 0);
        assert!(state.level >= 2);
        assert!(state.bond > 0.0);
    }

    #[test]
    fn derive_state_stuck_reflects_mood() {
        let mut pos = GreatWorkPosition::new();
        pos.plane_position_mut(Plane::Body).stuck = true;
        pos.plane_position_mut(Plane::Mind).stuck = true;
        let now = chrono::Utc::now();
        let state = pos.derive_state_from_position(now);
        assert_eq!(state.mood, Mood::Disappointed);
    }

    #[test]
    fn derive_state_all_coagulation_reflects_proud() {
        let mut pos = GreatWorkPosition::new();
        for plane in Plane::ALL {
            let p = pos.plane_position_mut(*plane);
            p.stage = Stage::Coagulation;
        }
        let now = chrono::Utc::now();
        let state = pos.derive_state_from_position(now);
        assert_eq!(state.mood, Mood::Proud);
    }

    #[test]
    fn evidence_threshold_increases_with_stage() {
        assert_eq!(Stage::Calcination.evidence_threshold(), 2);
        assert!(Stage::Coagulation.evidence_threshold() >= Stage::Calcination.evidence_threshold());
    }

    #[test]
    fn complete_work_is_complete() {
        let mut pos = GreatWorkPosition::new();
        for plane in Plane::ALL {
            let p = pos.plane_position_mut(*plane);
            p.stage = Stage::Coagulation;
        }
        assert!(pos.is_complete());
    }
}
