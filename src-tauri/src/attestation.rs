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

/// Check if the attester key is configured (env var STARCHILD_ATTESTER_KEY).
pub fn attester_key_available() -> bool {
    std::env::var("STARCHILD_ATTESTER_KEY")
        .ok()
        .filter(|k| !k.is_empty() && k.starts_with("0x") || k.len() == 64)
        .is_some()
}

/// Anchor the journey proof on-chain via EAS on Base.
/// Returns the transaction hash as a hex string.
pub async fn anchor_journey_onchain(
    user_hash: [u8; 32],
    journey_root: [u8; 32],
    quest_count: u64,
    streak: u64,
) -> Result<String, String> {
    use alloy::primitives::{Address, Bytes, FixedBytes, U256};
    use alloy::providers::{Provider, ProviderBuilder};
    use alloy::sol_types::SolCall;

    let attester_key_hex = std::env::var("STARCHILD_ATTESTER_KEY")
        .map_err(|_| "STARCHILD_ATTESTER_KEY env var not set -- on-chain anchoring disabled".to_string())?;

    let attester_key_hex = attester_key_hex.strip_prefix("0x").unwrap_or(&attester_key_hex);

    // Parse the private key
    let key_bytes: [u8; 32] = hex::decode(attester_key_hex)
        .map_err(|e| format!("Invalid attester key: {e}"))?
        .try_into()
        .map_err(|_| "Attester key must be 32 bytes".to_string())?;

    let signer = alloy::signers::local::PrivateKeySigner::from_bytes(
        &FixedBytes::from(key_bytes),
    )
    .map_err(|e| format!("Failed to create signer: {e}"))?;

    let signer_address = signer.address();
    log::info!("Attester address: {}", signer_address);

    // Build provider with signer
    let provider = ProviderBuilder::new()
        .with_recommended_fillers()
        .wallet(alloy::network::EthereumWallet::from(signer))
        .on_http(BASE_RPC.parse().map_err(|e| format!("Invalid RPC URL: {e}"))?);

    // Encode the attestation data: (bytes32 userHash, bytes32 journeyRoot, uint64 questCount, uint64 currentStreak)
    // Use standard ABI encoding for the inner data
    let encoded_data = alloy::sol_types::SolValue::abi_encode(&(
        FixedBytes::<32>::from(user_hash),
        FixedBytes::<32>::from(journey_root),
        quest_count,
        streak,
    ));

    // Schema UID
    let schema_uid_bytes: [u8; 32] = hex::decode(SCHEMA_UID.strip_prefix("0x").unwrap_or(SCHEMA_UID))
        .map_err(|e| format!("Invalid schema UID: {e}"))?
        .try_into()
        .map_err(|_| "Schema UID must be 32 bytes".to_string())?;

    // Encode the EAS `attest` function call
    // function attest(AttestationRequest calldata request) external payable returns (bytes32)
    // struct AttestationRequest { bytes32 schema; AttestationRequestData data; }
    // struct AttestationRequestData {
    //   address recipient; uint64 expirationTime; bool revocable;
    //   bytes32 refUID; bytes data; uint256 value;
    // }
    alloy::sol! {
        struct AttestationRequestData {
            address recipient;
            uint64 expirationTime;
            bool revocable;
            bytes32 refUID;
            bytes data;
            uint256 value;
        }

        struct AttestationRequest {
            bytes32 schema;
            AttestationRequestData data;
        }

        function attest(AttestationRequest request) external payable returns (bytes32);
    }

    let request = AttestationRequest {
        schema: FixedBytes::<32>::from(schema_uid_bytes),
        data: AttestationRequestData {
            recipient: Address::ZERO, // no specific recipient
            expirationTime: 0,        // no expiration
            revocable: false,
            refUID: FixedBytes::<32>::ZERO,
            data: Bytes::from(encoded_data),
            value: U256::ZERO,
        },
    };

    let calldata = attestCall::new((request,)).abi_encode();

    let eas_address: Address = EAS_CONTRACT
        .parse()
        .map_err(|e| format!("Invalid EAS address: {e}"))?;

    // Build and send the transaction
    let tx = alloy::rpc::types::TransactionRequest::default()
        .to(eas_address)
        .input(Bytes::from(calldata).into());

    let pending = provider
        .send_transaction(tx)
        .await
        .map_err(|e| format!("Failed to send attestation tx: {e}"))?;

    let tx_hash = format!("{}", pending.tx_hash());
    log::info!("Attestation tx sent: {}", tx_hash);

    // Return the hash immediately. The caller updates the DB.
    Ok(tx_hash)
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
