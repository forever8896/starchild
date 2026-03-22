use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fmt;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Each level requires `level * 100` XP to advance.
pub const XP_PER_LEVEL: fn(i32) -> i64 = |level| (level as i64) * 100;

/// Hunger decays at approximately 2.0 points per hour.
const HUNGER_DECAY_PER_SECOND: f64 = 2.0 / 3600.0;

// ---------------------------------------------------------------------------
// Mood
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum Mood {
    Ecstatic,
    Happy,
    Content,
    Restless,
    Hungry,
    Starving,
    Proud,
    Disappointed,
    Fierce,
}

impl Mood {
    /// Derive a mood purely from the current hunger value.
    pub fn from_hunger(hunger: f64) -> Mood {
        if hunger >= 90.0 {
            Mood::Ecstatic
        } else if hunger >= 70.0 {
            Mood::Happy
        } else if hunger >= 50.0 {
            Mood::Content
        } else if hunger >= 35.0 {
            Mood::Restless
        } else if hunger >= 20.0 {
            Mood::Hungry
        } else {
            Mood::Starving
        }
    }
}

impl fmt::Display for Mood {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let label = match self {
            Mood::Ecstatic => "Ecstatic",
            Mood::Happy => "Happy",
            Mood::Content => "Content",
            Mood::Restless => "Restless",
            Mood::Hungry => "Hungry",
            Mood::Starving => "Starving",
            Mood::Proud => "Proud",
            Mood::Disappointed => "Disappointed",
            Mood::Fierce => "Fierce",
        };
        write!(f, "{}", label)
    }
}

/// Parse a `Mood` from its display string.  Falls back to `Content` for
/// unrecognised values so a corrupted DB row doesn't crash the app.
impl From<&str> for Mood {
    fn from(s: &str) -> Self {
        match s {
            "Ecstatic" => Mood::Ecstatic,
            "Happy" => Mood::Happy,
            "Content" => Mood::Content,
            "Restless" => Mood::Restless,
            "Hungry" => Mood::Hungry,
            "Starving" => Mood::Starving,
            "Proud" => Mood::Proud,
            "Disappointed" => Mood::Disappointed,
            "Fierce" => Mood::Fierce,
            _ => Mood::Content,
        }
    }
}

// ---------------------------------------------------------------------------
// StarchildState
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct StarchildState {
    /// 0-100 -- higher means more fed / happier.
    pub hunger: f64,
    pub mood: Mood,
    /// 0-100.
    pub energy: f64,
    /// 0-100, grows slowly over time through interactions.
    pub bond: f64,
    pub xp: i64,
    pub level: i32,
    /// Timestamp of the last hunger-decay tick, used to compute elapsed decay.
    pub last_decay_at: DateTime<Utc>,
}

impl StarchildState {
    // -- Construction -------------------------------------------------------

    /// Create a brand-new Starchild with sensible defaults.
    pub fn new() -> Self {
        Self {
            hunger: 50.0,
            mood: Mood::from_hunger(50.0),
            energy: 100.0,
            bond: 0.0,
            xp: 0,
            level: 1,
            last_decay_at: Utc::now(),
        }
    }

    /// Reconstruct a `StarchildState` from individual database column values.
    ///
    /// `last_decay_at` is expected in RFC 3339 format (the default for
    /// `chrono::DateTime<Utc>::to_rfc3339()`).  If parsing fails the current
    /// time is used so the game can recover gracefully.
    pub fn from_db_row(
        hunger: f64,
        mood: &str,
        energy: f64,
        bond: f64,
        xp: i64,
        level: i32,
        last_decay_at: &str,
    ) -> Self {
        let parsed_time = DateTime::parse_from_rfc3339(last_decay_at)
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(|_| Utc::now());

        Self {
            hunger: hunger.clamp(0.0, 100.0),
            mood: Mood::from(mood),
            energy: energy.clamp(0.0, 100.0),
            bond: bond.clamp(0.0, 100.0),
            xp,
            level,
            last_decay_at: parsed_time,
        }
    }

    // -- Hunger / decay -----------------------------------------------------

    /// Apply passive hunger decay based on real wall-clock time elapsed since
    /// the last decay tick.  Rate is approximately 2 points per hour.
    ///
    /// Also advances `last_decay_at` to `Utc::now()` and refreshes mood.
    pub fn apply_hunger_decay(&mut self) {
        let now = Utc::now();
        let elapsed_seconds = (now - self.last_decay_at).num_milliseconds().max(0) as f64 / 1000.0;

        let decay = elapsed_seconds * HUNGER_DECAY_PER_SECOND;
        self.hunger = (self.hunger - decay).clamp(0.0, 100.0);
        self.last_decay_at = now;
        self.update_mood();
    }

    /// Feed the Starchild, increasing hunger by `amount`.
    ///
    /// Also grants a small bond increase (+0.1) and refreshes mood.
    pub fn feed(&mut self, amount: f64) {
        self.hunger = (self.hunger + amount).clamp(0.0, 100.0);
        self.bond = (self.bond + 0.1).clamp(0.0, 100.0);
        self.update_mood();
    }

    // -- XP / levelling -----------------------------------------------------

    /// Add experience points and check for a level-up.
    ///
    /// Returns `true` if the Starchild levelled up (possibly multiple times
    /// if `amount` is very large).
    pub fn add_xp(&mut self, amount: i64) -> bool {
        self.xp += amount;
        let mut levelled_up = false;

        while self.xp >= self.xp_to_next_level() {
            self.xp -= self.xp_to_next_level();
            self.level += 1;
            levelled_up = true;
        }

        levelled_up
    }

    /// XP required to advance from the current level to the next.
    pub fn xp_to_next_level(&self) -> i64 {
        XP_PER_LEVEL(self.level)
    }

    // -- Mood ---------------------------------------------------------------

    /// Recalculate mood from the current hunger level.
    pub fn update_mood(&mut self) {
        self.mood = Mood::from_hunger(self.hunger);
    }

    // -- Display helpers ----------------------------------------------------

    /// Return a short, human-readable description of the hunger level.
    pub fn hunger_status(&self) -> &str {
        if self.hunger >= 90.0 {
            "Completely stuffed -- couldn't eat another bite!"
        } else if self.hunger >= 70.0 {
            "Well fed and satisfied."
        } else if self.hunger >= 50.0 {
            "Feeling alright, could eat a snack."
        } else if self.hunger >= 35.0 {
            "Getting peckish..."
        } else if self.hunger >= 20.0 {
            "Really hungry -- please feed me!"
        } else {
            "Starving! Desperately needs food!"
        }
    }
}

impl Default for StarchildState {
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
    use chrono::Duration;

    #[test]
    fn test_new_defaults() {
        let state = StarchildState::new();
        assert_eq!(state.hunger, 50.0);
        assert_eq!(state.energy, 100.0);
        assert_eq!(state.bond, 0.0);
        assert_eq!(state.xp, 0);
        assert_eq!(state.level, 1);
        assert_eq!(state.mood, Mood::Content);
    }

    #[test]
    fn test_mood_from_hunger() {
        assert_eq!(Mood::from_hunger(95.0), Mood::Ecstatic);
        assert_eq!(Mood::from_hunger(90.0), Mood::Ecstatic);
        assert_eq!(Mood::from_hunger(75.0), Mood::Happy);
        assert_eq!(Mood::from_hunger(50.0), Mood::Content);
        assert_eq!(Mood::from_hunger(40.0), Mood::Restless);
        assert_eq!(Mood::from_hunger(25.0), Mood::Hungry);
        assert_eq!(Mood::from_hunger(10.0), Mood::Starving);
        assert_eq!(Mood::from_hunger(0.0), Mood::Starving);
    }

    #[test]
    fn test_mood_display_roundtrip() {
        let moods = vec![
            Mood::Ecstatic,
            Mood::Happy,
            Mood::Content,
            Mood::Restless,
            Mood::Hungry,
            Mood::Starving,
            Mood::Proud,
            Mood::Disappointed,
            Mood::Fierce,
        ];
        for mood in moods {
            let s = mood.to_string();
            let parsed: Mood = Mood::from(s.as_str());
            assert_eq!(parsed, mood);
        }
    }

    #[test]
    fn test_feed() {
        let mut state = StarchildState::new(); // hunger = 50
        state.feed(25.0);
        assert_eq!(state.hunger, 75.0);
        assert!((state.bond - 0.1).abs() < f64::EPSILON);
        assert_eq!(state.mood, Mood::Happy);
    }

    #[test]
    fn test_feed_clamps_to_100() {
        let mut state = StarchildState::new();
        state.feed(200.0);
        assert_eq!(state.hunger, 100.0);
    }

    #[test]
    fn test_hunger_decay() {
        let mut state = StarchildState::new();
        // Pretend last decay was 1 hour ago => should lose ~2 points.
        state.last_decay_at = Utc::now() - Duration::hours(1);
        let before = state.hunger;
        state.apply_hunger_decay();
        let lost = before - state.hunger;
        // Allow a small tolerance for timing jitter.
        assert!((lost - 2.0).abs() < 0.1, "Expected ~2.0 decay, got {lost}");
    }

    #[test]
    fn test_hunger_decay_clamps_to_zero() {
        let mut state = StarchildState::new();
        state.hunger = 1.0;
        state.last_decay_at = Utc::now() - Duration::hours(10);
        state.apply_hunger_decay();
        assert_eq!(state.hunger, 0.0);
    }

    #[test]
    fn test_add_xp_no_level_up() {
        let mut state = StarchildState::new(); // level 1, needs 100 XP
        let levelled = state.add_xp(50);
        assert!(!levelled);
        assert_eq!(state.xp, 50);
        assert_eq!(state.level, 1);
    }

    #[test]
    fn test_add_xp_level_up() {
        let mut state = StarchildState::new(); // level 1, needs 100 XP
        let levelled = state.add_xp(100);
        assert!(levelled);
        assert_eq!(state.level, 2);
        assert_eq!(state.xp, 0);
    }

    #[test]
    fn test_add_xp_multiple_level_ups() {
        let mut state = StarchildState::new(); // level 1
        // 100 (lvl1->2) + 200 (lvl2->3) + 50 leftover = 350
        let levelled = state.add_xp(350);
        assert!(levelled);
        assert_eq!(state.level, 3);
        assert_eq!(state.xp, 50);
    }

    #[test]
    fn test_xp_to_next_level() {
        let mut state = StarchildState::new();
        assert_eq!(state.xp_to_next_level(), 100);
        state.level = 5;
        assert_eq!(state.xp_to_next_level(), 500);
    }

    #[test]
    fn test_from_db_row() {
        let now = Utc::now().to_rfc3339();
        let state = StarchildState::from_db_row(65.0, "Happy", 80.0, 12.5, 42, 3, &now);
        assert_eq!(state.hunger, 65.0);
        assert_eq!(state.mood, Mood::Happy);
        assert_eq!(state.energy, 80.0);
        assert_eq!(state.bond, 12.5);
        assert_eq!(state.xp, 42);
        assert_eq!(state.level, 3);
    }

    #[test]
    fn test_from_db_row_bad_timestamp_recovers() {
        let state = StarchildState::from_db_row(50.0, "Content", 100.0, 0.0, 0, 1, "not-a-date");
        // Should not panic; last_decay_at falls back to now.
        assert_eq!(state.hunger, 50.0);
    }

    #[test]
    fn test_from_db_row_clamps_values() {
        let now = Utc::now().to_rfc3339();
        let state = StarchildState::from_db_row(150.0, "Ecstatic", -10.0, 999.0, 0, 1, &now);
        assert_eq!(state.hunger, 100.0);
        assert_eq!(state.energy, 0.0);
        assert_eq!(state.bond, 100.0);
    }

    #[test]
    fn test_hunger_status_strings() {
        let mut state = StarchildState::new();

        state.hunger = 95.0;
        assert!(state.hunger_status().contains("stuffed"));

        state.hunger = 75.0;
        assert!(state.hunger_status().contains("satisfied"));

        state.hunger = 55.0;
        assert!(state.hunger_status().contains("snack"));

        state.hunger = 40.0;
        assert!(state.hunger_status().contains("peckish"));

        state.hunger = 25.0;
        assert!(state.hunger_status().contains("hungry"));

        state.hunger = 5.0;
        assert!(state.hunger_status().contains("Starving"));
    }

    #[test]
    fn test_serde_roundtrip() {
        let state = StarchildState::new();
        let json = serde_json::to_string(&state).expect("serialize");
        let deserialized: StarchildState = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized.hunger, state.hunger);
        assert_eq!(deserialized.mood, state.mood);
        assert_eq!(deserialized.level, state.level);
    }

    // -- Quest Completion Impact on Game State --------------------------------

    #[test]
    fn test_quest_completion_feeds_and_awards_xp() {
        let mut state = StarchildState::new();
        let initial_hunger = state.hunger;
        let initial_bond = state.bond;
        let initial_xp = state.xp;

        // Simulate quest completion: xp_reward = 30
        let xp_reward = 30_i64;
        let levelled_up = state.add_xp(xp_reward);
        state.feed(xp_reward as f64 / 10.0);

        assert_eq!(state.xp, initial_xp + xp_reward);
        assert!(!levelled_up); // 30 XP < 100 needed for level 2
        assert!((state.hunger - (initial_hunger + 3.0)).abs() < 0.01); // +3.0 hunger (30/10)
        assert!((state.bond - (initial_bond + 0.1)).abs() < 0.01); // +0.1 bond from feed
    }

    #[test]
    fn test_quest_completion_can_level_up() {
        let mut state = StarchildState::new();
        assert_eq!(state.level, 1);

        // Complete quests worth 100+ XP total → should level up
        let levelled = state.add_xp(100);
        assert!(levelled);
        assert_eq!(state.level, 2);
        assert_eq!(state.xp, 0); // residual after level-up
    }

    #[test]
    fn test_hunger_decay_over_time_affects_mood() {
        let mut state = StarchildState::new();
        assert_eq!(state.hunger, 50.0); // starts at 50 (Content)
        assert_eq!(state.mood, Mood::Content);

        // Simulate 10 hours of decay: 10 * 2.0 = 20 points
        state.hunger = (state.hunger - 20.0).clamp(0.0, 100.0);
        state.update_mood();

        assert_eq!(state.hunger, 30.0);
        assert_eq!(state.mood, Mood::Hungry); // 20-34 → Hungry

        // Feed via quest completion: +5 hunger
        state.feed(5.0);
        assert_eq!(state.hunger, 35.0);
        assert_eq!(state.mood, Mood::Restless); // 35-49 → Restless
    }

    #[test]
    fn test_conversation_only_affects_bond() {
        let mut state = StarchildState::new();
        let initial_hunger = state.hunger;
        let initial_xp = state.xp;
        // Simulate 5 messages: bond += 0.05 each
        for _ in 0..5 {
            state.bond = (state.bond + 0.05).clamp(0.0, 100.0);
        }

        assert_eq!(state.hunger, initial_hunger); // unchanged
        assert_eq!(state.xp, initial_xp); // unchanged
        assert!((state.bond - 0.25).abs() < 0.01); // 5 * 0.05 = 0.25
    }
}
