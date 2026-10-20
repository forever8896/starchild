//! End-to-End Encryption for Venice AI — desktop wiring.
//!
//! The crypto (key handling, ECDH → HKDF → AES-256-GCM, encrypt/decrypt) lives
//! in `starchild_core::e2ee` and is re-exported here at the original
//! `crate::e2ee` path. The **network** half of the handshake — fetching and
//! verifying Venice's TEE attestation, which needs `reqwest` — lives in the
//! desktop [`crate::e2ee_net`] module.

pub use starchild_core::e2ee::*;
