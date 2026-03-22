//! On-chain attestation system for Starchild using EAS (Ethereum Attestation Service) on Base L2.
//!
//! Architecture:
//! - The USER has no wallet. Only Starchild's project wallet pays for attestations.
//! - A local `verification_secret` (random 32 bytes) is stored in SQLite.
//! - `user_hash = sha256(verification_secret)` goes on-chain as a pseudonymous ID.
//! - Quest completions are hashed and collected into a Merkle tree.
//! - Periodically, a Merkle root is anchored on-chain via EAS on Base.
//!
//! Privacy: No quest content, no names, no user wallet addresses go on-chain.

use sha2::{Digest, Sha256};

use crate::db::Database;

// ---------------------------------------------------------------------------
// EAS contract addresses on Base
// ---------------------------------------------------------------------------

/// EAS contract on Base L2
pub const EAS_CONTRACT: &str = "0x4200000000000000000000000000000000000021";

/// Schema Registry on Base L2
#[allow(dead_code)]
pub const SCHEMA_REGISTRY: &str = "0x4200000000000000000000000000000000000020";

/// Base chain RPC endpoint
pub const BASE_RPC: &str = "https://mainnet.base.org";

/// Base chain ID
pub const BASE_CHAIN_ID: u64 = 8453;

/// Placeholder schema UID — fill in after registering the EAS schema.
/// Schema: "bytes32 userHash, bytes32 journeyRoot, uint64 questCount, uint64 currentStreak"
pub const SCHEMA_UID: &str =
    "0x0000000000000000000000000000000000000000000000000000000000000000";

// ---------------------------------------------------------------------------
// Verification secret management
// ---------------------------------------------------------------------------

/// Get or create the 32-byte verification secret. Returns hex-encoded string.
pub fn get_or_create_verification_secret(db: &Database) -> Result<String, String> {
    // Try to load from DB
    if let Ok(Some(secret)) = db.get_setting("verification_secret") {
        if secret.len() == 64 {
            // valid 32-byte hex
            return Ok(secret);
        }
    }

    // Generate a new random 32-byte secret
    let mut secret_bytes = [0u8; 32];
    getrandom(&mut secret_bytes)?;
    let secret_hex = hex::encode(secret_bytes);

    // Store in DB
    db.set_setting("verification_secret", &secret_hex)
        .map_err(|e| format!("Failed to save verification secret: {e}"))?;

    log::info!("Generated new verification secret");
    Ok(secret_hex)
}

/// Compute user_hash = sha256(verification_secret_bytes)
pub fn compute_user_hash(verification_secret_hex: &str) -> Result<[u8; 32], String> {
    let secret_bytes =
        hex::decode(verification_secret_hex).map_err(|e| format!("Invalid secret hex: {e}"))?;
    let mut hasher = Sha256::new();
    hasher.update(&secret_bytes);
    Ok(hasher.finalize().into())
}

// ---------------------------------------------------------------------------
// Quest hash computation
// ---------------------------------------------------------------------------

/// Compute quest_hash = sha256(quest_id + quest_title + completed_at + verification_secret)
pub fn compute_quest_hash(
    quest_id: &str,
    quest_title: &str,
    completed_at: &str,
    verification_secret_hex: &str,
) -> Result<[u8; 32], String> {
    let secret_bytes = hex::decode(verification_secret_hex)
        .map_err(|e| format!("Invalid secret hex: {e}"))?;

    let mut hasher = Sha256::new();
    hasher.update(quest_id.as_bytes());
    hasher.update(quest_title.as_bytes());
    hasher.update(completed_at.as_bytes());
    hasher.update(&secret_bytes);
    Ok(hasher.finalize().into())
}

// ---------------------------------------------------------------------------
// Merkle tree
// ---------------------------------------------------------------------------

/// Build a Merkle tree from a list of 32-byte leaf hashes and return the root.
/// If the list is empty, returns a zero hash.
/// Leaves are sorted before building for deterministic results.
pub fn compute_merkle_root(mut leaves: Vec<[u8; 32]>) -> [u8; 32] {
    if leaves.is_empty() {
        return [0u8; 32];
    }
    if leaves.len() == 1 {
        return leaves[0];
    }

    // Sort leaves for deterministic ordering
    leaves.sort();

    let mut current_level = leaves;

    while current_level.len() > 1 {
        let mut next_level = Vec::new();

        for chunk in current_level.chunks(2) {
            let mut hasher = Sha256::new();
            hasher.update(chunk[0]);
            if chunk.len() == 2 {
                hasher.update(chunk[1]);
            } else {
                // Odd number: duplicate the last element
                hasher.update(chunk[0]);
            }
            next_level.push(hasher.finalize().into());
        }

        current_level = next_level;
    }

    current_level[0]
}

// ---------------------------------------------------------------------------
// Journey proof computation (from local DB data)
// ---------------------------------------------------------------------------

/// Result of computing the journey proof from local data.
#[derive(serde::Serialize, Clone, Debug)]
pub struct JourneyProof {
    pub user_hash: String,
    pub journey_root: String,
    pub quest_count: u64,
    pub streak: u64,
    pub anchored: bool,
    pub last_anchor_tx: Option<String>,
}

/// Compute the current journey proof from local database state.
pub fn compute_journey_proof(db: &Database) -> Result<JourneyProof, String> {
    let secret_hex = get_or_create_verification_secret(db)?;
    let user_hash = compute_user_hash(&secret_hex)?;

    // Get all completed quests
    let completed_quests = db
        .get_quests(Some("completed"))
        .map_err(|e| format!("Failed to get quests: {e}"))?;

    let quest_count = completed_quests.len() as u64;

    // Compute the current streak: max streak_count among completed quests
    let streak = completed_quests
        .iter()
        .map(|q| q.streak_count as u64)
        .max()
        .unwrap_or(0);

    // Compute quest hashes
    let mut quest_hashes = Vec::new();
    for quest in &completed_quests {
        let completed_at = quest.completed_at.as_deref().unwrap_or("");
        let hash = compute_quest_hash(&quest.id, &quest.title, completed_at, &secret_hex)?;
        quest_hashes.push(hash);
    }

    // Build Merkle tree
    let journey_root = compute_merkle_root(quest_hashes);

    // Check if this root has already been anchored
    let (anchored, last_anchor_tx) = check_anchor_status(db, &journey_root);

    Ok(JourneyProof {
        user_hash: format!("0x{}", hex::encode(user_hash)),
        journey_root: format!("0x{}", hex::encode(journey_root)),
        quest_count,
        streak,
        anchored,
        last_anchor_tx,
    })
}

/// Check if a given journey root has been anchored on-chain.
fn check_anchor_status(db: &Database, journey_root: &[u8; 32]) -> (bool, Option<String>) {
    let root_hex = hex::encode(journey_root);
    // Look for a confirmed attestation with this root in metadata
    if let Ok(attestations) = db.get_attestations() {
        for att in &attestations {
            if att.status == "confirmed" && att.achievement_type == "journey_anchor" {
                if let Some(ref metadata) = att.metadata {
                    if metadata.contains(&root_hex) {
                        return (true, att.tx_hash.clone());
                    }
                }
            }
        }
        // Also return the most recent confirmed anchor tx even if root differs
        for att in &attestations {
            if att.status == "confirmed" && att.achievement_type == "journey_anchor" {
                return (false, att.tx_hash.clone());
            }
        }
    }
    (false, None)
}

// ---------------------------------------------------------------------------
// EAS on-chain attestation
// ---------------------------------------------------------------------------

/// Relay URL for submitting attestations.
/// The relay holds the project wallet and signs EAS attestations on behalf of users.
/// Users need no wallet, no ETH, no crypto knowledge.
const RELAY_URL: &str = "https://starchild-relay.starchild.workers.dev";

/// Submit a journey proof to the attestation relay for on-chain anchoring.
/// The relay signs and submits the EAS attestation on Base using the project wallet.
/// Returns the transaction hash.
pub async fn submit_to_relay(
    http_client: &reqwest::Client,
    user_hash: &str,
    journey_root: &str,
    quest_count: u64,
    streak: u64,
) -> Result<String, String> {
    let relay_url = std::env::var("STARCHILD_RELAY_URL")
        .unwrap_or_else(|_| RELAY_URL.to_string());

    let body = serde_json::json!({
        "user_hash": user_hash,
        "journey_root": journey_root,
        "quest_count": quest_count,
        "streak": streak,
    });

    log::info!("Submitting attestation to relay: {relay_url}/attest");

    let response = http_client
        .post(format!("{relay_url}/attest"))
        .json(&body)
        .timeout(std::time::Duration::from_secs(60))
        .send()
        .await
        .map_err(|e| format!("Relay request failed: {e}"))?;

    if !response.status().is_success() {
        let error_body = response.text().await.unwrap_or_default();
        return Err(format!("Relay error: {error_body}"));
    }

    #[derive(serde::Deserialize)]
    struct RelayResponse {
        tx_hash: String,
    }

    let result: RelayResponse = response.json().await
        .map_err(|e| format!("Failed to parse relay response: {e}"))?;

    log::info!("Attestation tx submitted via relay: {}", result.tx_hash);
    Ok(result.tx_hash)
}

// ---------------------------------------------------------------------------
// Simple CSPRNG helper (uses getrandom crate via sha2's dependency)
// ---------------------------------------------------------------------------

fn getrandom(dest: &mut [u8]) -> Result<(), String> {
    // Use the OS random source. sha2 pulls in the `digest` crate which
    // depends on `crypto-common` which has `getrandom` available.
    // However, the simplest portable approach: use uuid's random + hash.
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    // Mix multiple uuid v4s for entropy
    for _ in 0..4 {
        hasher.update(uuid::Uuid::new_v4().as_bytes());
    }
    // Mix in current time
    hasher.update(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
            .to_le_bytes(),
    );
    let hash = hasher.finalize();
    let len = dest.len().min(hash.len());
    dest[..len].copy_from_slice(&hash[..len]);
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_quest_hash() {
        let hash = compute_quest_hash(
            "quest-123",
            "Meditate for 10 minutes",
            "2025-01-15 10:30:00",
            "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
        )
        .unwrap();
        // Should produce a deterministic 32-byte hash
        assert_eq!(hash.len(), 32);

        // Same inputs should produce same output
        let hash2 = compute_quest_hash(
            "quest-123",
            "Meditate for 10 minutes",
            "2025-01-15 10:30:00",
            "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
        )
        .unwrap();
        assert_eq!(hash, hash2);
    }

    #[test]
    fn test_merkle_root_empty() {
        let root = compute_merkle_root(vec![]);
        assert_eq!(root, [0u8; 32]);
    }

    #[test]
    fn test_merkle_root_single() {
        let leaf = [1u8; 32];
        let root = compute_merkle_root(vec![leaf]);
        assert_eq!(root, leaf);
    }

    #[test]
    fn test_merkle_root_deterministic() {
        let a = [1u8; 32];
        let b = [2u8; 32];

        let root1 = compute_merkle_root(vec![a, b]);
        let root2 = compute_merkle_root(vec![b, a]);

        // Should be the same regardless of input order (sorted)
        assert_eq!(root1, root2);
    }

    #[test]
    fn test_merkle_root_different_inputs() {
        let a = [1u8; 32];
        let b = [2u8; 32];
        let c = [3u8; 32];

        let root_ab = compute_merkle_root(vec![a, b]);
        let root_abc = compute_merkle_root(vec![a, b, c]);

        assert_ne!(root_ab, root_abc);
    }

    #[test]
    fn test_user_hash() {
        let secret = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
        let hash = compute_user_hash(secret).unwrap();
        assert_eq!(hash.len(), 32);
        // Deterministic
        let hash2 = compute_user_hash(secret).unwrap();
        assert_eq!(hash, hash2);
    }
}
