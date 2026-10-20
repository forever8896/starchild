//! Network half of the Venice E2EE handshake — desktop only.
//!
//! The crypto (key handling, ECDH → HKDF → AES-256-GCM, encrypt/decrypt) is
//! pure and lives in `starchild_core::e2ee`. The piece that needs `reqwest` —
//! fetching and verifying Venice's TEE attestation, from which the model's
//! public key is extracted — is split out here so the core stays WASM-safe.

use starchild_core::e2ee::{AttestationResponse, E2eeError, E2eeSession, Result};

/// Bootstrap an E2EE session:
///   1. Generate a nonce and fetch the TEE attestation for `model`
///   2. Verify the nonce echo + attestation flag
///   3. Extract the model's signing (public) key
///   4. Hand the key to [`E2eeSession::new`] for the pure crypto setup
pub async fn establish(
    http: &reqwest::Client,
    api_key: &str,
    base_url: &str,
    model: &str,
) -> Result<E2eeSession> {
    // 1. Generate nonce (32 bytes = 64 hex chars)
    let nonce_bytes: [u8; 32] = rand::random();
    let nonce_hex = hex::encode(nonce_bytes);

    // 2. Fetch attestation
    let url = format!("{base_url}/tee/attestation?model={model}&nonce={nonce_hex}");
    let resp = http
        .get(&url)
        .header("Authorization", format!("Bearer {api_key}"))
        .send()
        .await
        .map_err(|e| E2eeError::Network(e.to_string()))?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(E2eeError::Attestation(format!("HTTP {}: {body}", body.len())));
    }

    let attestation: AttestationResponse = resp
        .json()
        .await
        .map_err(|e| E2eeError::Network(e.to_string()))?;

    // 3. Verify nonce matches (check both field names)
    let resp_nonce = attestation
        .nonce
        .as_deref()
        .or(attestation.request_nonce.as_deref())
        .unwrap_or("");
    if resp_nonce != nonce_hex {
        return Err(E2eeError::Attestation(format!(
            "nonce mismatch: expected {nonce_hex}, got {resp_nonce}"
        )));
    }

    // 4. Verify attestation (if field present)
    if attestation.verified == Some(false) {
        return Err(E2eeError::Attestation("attestation not verified".into()));
    }

    // 5. Extract model's signing key and finish the (pure) crypto setup.
    let model_pub_hex = attestation
        .signing_key
        .or(attestation.signing_public_key)
        .ok_or_else(|| {
            E2eeError::Attestation("no signing_key or signing_public_key in attestation".into())
        })?;

    let session = E2eeSession::new(model_pub_hex)?;
    log::info!("E2EE session established for model {model}");
    Ok(session)
}
