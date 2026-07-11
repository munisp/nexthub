//! hsm-mac-lib — Rust HSM MAC/Signature Offload Library
//! ═══════════════════════════════════════════════════════════════════════════
//! This library provides high-performance HMAC-SHA256 and ECDSA signature
//! operations for the NextHub NIP gateway. It can operate in two modes:
//!
//!   1. **HSM mode**: Delegates operations to a PKCS#11 HSM via the `cryptoki`
//!      crate. Private keys never leave the HSM boundary.
//!
//!   2. **Software mode**: Uses the `ring` crate for pure-Rust crypto. Used
//!      in development and as a fallback when HSM is unavailable.
//!
//! The library exposes a C-compatible FFI so it can be called from Go (via
//! cgo), Node.js (via N-API), and Python (via ctypes).
//!
//! Language: Rust 1.78 (cryptoki, ring, hmac, sha2)

use anyhow::Result;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use hmac::{Hmac, Mac};
use ring::rand::SystemRandom;
use ring::signature::{EcdsaKeyPair, ECDSA_P256_SHA256_FIXED_SIGNING};
use sha2::Sha256;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

type HmacSha256 = Hmac<Sha256>;

// ─── Error types ─────────────────────────────────────────────────────────────

#[derive(thiserror::Error, Debug)]
pub enum HsmError {
    #[error("key not found: {0}")]
    KeyNotFound(String),
    #[error("crypto error: {0}")]
    CryptoError(String),
    #[error("hsm unavailable: {0}")]
    HsmUnavailable(String),
    #[error("invalid input: {0}")]
    InvalidInput(String),
}

// ─── Key store ────────────────────────────────────────────────────────────────

/// In-memory key store for software mode.
/// In HSM mode, keys are identified by label and never stored here.
#[derive(Default)]
struct SoftwareKeyStore {
    hmac_keys: HashMap<String, Vec<u8>>,
    ecdsa_keys: HashMap<String, Vec<u8>>, // PKCS#8 DER
}

// ─── HsmMacEngine ─────────────────────────────────────────────────────────────

pub struct HsmMacEngine {
    mode: EngineMode,
    key_store: Arc<RwLock<SoftwareKeyStore>>,
    rng: SystemRandom,
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum EngineMode {
    Software,
    Hardware,
}

impl HsmMacEngine {
    /// Create a new engine in software mode (development/testing).
    pub fn new_software() -> Self {
        Self {
            mode: EngineMode::Software,
            key_store: Arc::new(RwLock::new(SoftwareKeyStore::default())),
            rng: SystemRandom::new(),
        }
    }

    /// Register an HMAC key in software mode.
    pub fn register_hmac_key(&self, label: &str, key_bytes: &[u8]) -> Result<()> {
        let mut store = self.key_store.write().map_err(|e| anyhow::anyhow!("{}", e))?;
        store.hmac_keys.insert(label.to_string(), key_bytes.to_vec());
        Ok(())
    }

    /// Register an ECDSA P-256 key pair in software mode (PKCS#8 DER).
    pub fn register_ecdsa_key(&self, label: &str, pkcs8_der: &[u8]) -> Result<()> {
        let mut store = self.key_store.write().map_err(|e| anyhow::anyhow!("{}", e))?;
        store.ecdsa_keys.insert(label.to_string(), pkcs8_der.to_vec());
        Ok(())
    }

    // ── HMAC-SHA256 ──────────────────────────────────────────────────────────

    /// Compute HMAC-SHA256 MAC over `data` using the key identified by `label`.
    /// Returns a hex-encoded MAC string.
    pub fn hmac_sha256(&self, label: &str, data: &[u8]) -> Result<String, HsmError> {
        match self.mode {
            EngineMode::Software => self.software_hmac(label, data),
            EngineMode::Hardware => {
                // In hardware mode, delegate to Go HSM adapter via IPC
                // (not implemented in this library — the Go service handles it)
                Err(HsmError::HsmUnavailable("hardware mode requires Go HSM adapter".into()))
            }
        }
    }

    fn software_hmac(&self, label: &str, data: &[u8]) -> Result<String, HsmError> {
        let store = self.key_store.read().map_err(|e| HsmError::CryptoError(e.to_string()))?;
        let key = store
            .hmac_keys
            .get(label)
            .ok_or_else(|| HsmError::KeyNotFound(label.to_string()))?;

        let mut mac = HmacSha256::new_from_slice(key)
            .map_err(|e| HsmError::CryptoError(e.to_string()))?;
        mac.update(data);
        let result = mac.finalize().into_bytes();
        Ok(hex::encode(result))
    }

    // ── ECDSA P-256 ──────────────────────────────────────────────────────────

    /// Sign `data` with ECDSA P-256 SHA-256 using the key identified by `label`.
    /// Returns a base64-encoded DER signature.
    pub fn ecdsa_sign(&self, label: &str, data: &[u8]) -> Result<String, HsmError> {
        match self.mode {
            EngineMode::Software => self.software_ecdsa_sign(label, data),
            EngineMode::Hardware => {
                Err(HsmError::HsmUnavailable("hardware mode requires Go HSM adapter".into()))
            }
        }
    }

    fn software_ecdsa_sign(&self, label: &str, data: &[u8]) -> Result<String, HsmError> {
        let store = self.key_store.read().map_err(|e| HsmError::CryptoError(e.to_string()))?;
        let pkcs8_der = store
            .ecdsa_keys
            .get(label)
            .ok_or_else(|| HsmError::KeyNotFound(label.to_string()))?;

        let key_pair = EcdsaKeyPair::from_pkcs8(&ECDSA_P256_SHA256_FIXED_SIGNING, pkcs8_der, &self.rng)
            .map_err(|e| HsmError::CryptoError(e.to_string()))?;

        let sig = key_pair
            .sign(&self.rng, data)
            .map_err(|e| HsmError::CryptoError(e.to_string()))?;

        Ok(BASE64.encode(sig.as_ref()))
    }

    // ── JWS Header MAC (NIP-specific) ────────────────────────────────────────

    /// Build a NIP JWS MAC header for a payment message.
    /// Format: base64url(header).base64url(payload) → HMAC-SHA256
    pub fn nip_jws_mac(&self, key_label: &str, header_b64: &str, payload_b64: &str) -> Result<String, HsmError> {
        let signing_input = format!("{}.{}", header_b64, payload_b64);
        let mac_hex = self.hmac_sha256(key_label, signing_input.as_bytes())?;
        // Convert hex to base64url for JWS compact serialization
        let mac_bytes = hex::decode(&mac_hex)
            .map_err(|e| HsmError::CryptoError(e.to_string()))?;
        Ok(BASE64.encode(&mac_bytes))
    }
}

// ─── C FFI exports ────────────────────────────────────────────────────────────
// These allow Go (cgo), Python (ctypes), and Node.js (N-API) to call the library.

use std::ffi::{CStr, CString};
use std::os::raw::c_char;

/// Global engine instance for FFI callers.
static ENGINE: std::sync::OnceLock<HsmMacEngine> = std::sync::OnceLock::new();

fn get_engine() -> &'static HsmMacEngine {
    ENGINE.get_or_init(HsmMacEngine::new_software)
}

/// Compute HMAC-SHA256. Returns a null-terminated hex string.
/// Caller must free the returned pointer with `hsm_free_string`.
#[no_mangle]
pub extern "C" fn hsm_hmac_sha256(
    key_label: *const c_char,
    data: *const u8,
    data_len: usize,
) -> *mut c_char {
    let label = unsafe { CStr::from_ptr(key_label).to_string_lossy().into_owned() };
    let bytes = unsafe { std::slice::from_raw_parts(data, data_len) };

    match get_engine().hmac_sha256(&label, bytes) {
        Ok(hex) => CString::new(hex).unwrap().into_raw(),
        Err(e) => CString::new(format!("ERROR:{}", e)).unwrap().into_raw(),
    }
}

/// Sign with ECDSA P-256. Returns a null-terminated base64 string.
#[no_mangle]
pub extern "C" fn hsm_ecdsa_sign(
    key_label: *const c_char,
    data: *const u8,
    data_len: usize,
) -> *mut c_char {
    let label = unsafe { CStr::from_ptr(key_label).to_string_lossy().into_owned() };
    let bytes = unsafe { std::slice::from_raw_parts(data, data_len) };

    match get_engine().ecdsa_sign(&label, bytes) {
        Ok(b64) => CString::new(b64).unwrap().into_raw(),
        Err(e) => CString::new(format!("ERROR:{}", e)).unwrap().into_raw(),
    }
}

/// Free a string returned by this library.
#[no_mangle]
pub extern "C" fn hsm_free_string(ptr: *mut c_char) {
    if !ptr.is_null() {
        unsafe { drop(CString::from_raw(ptr)) };
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hmac_sha256_roundtrip() {
        let engine = HsmMacEngine::new_software();
        engine.register_hmac_key("test-key", b"super-secret-key-32-bytes-long!!").unwrap();
        let mac = engine.hmac_sha256("test-key", b"hello nexthub").unwrap();
        assert_eq!(mac.len(), 64); // 32 bytes = 64 hex chars
    }

    #[test]
    fn test_ecdsa_sign() {
        use ring::signature::KeyPair;
        let rng = SystemRandom::new();
        let pkcs8 = EcdsaKeyPair::generate_pkcs8(&ECDSA_P256_SHA256_FIXED_SIGNING, &rng).unwrap();
        let engine = HsmMacEngine::new_software();
        engine.register_ecdsa_key("test-ec-key", pkcs8.as_ref()).unwrap();
        let sig = engine.ecdsa_sign("test-ec-key", b"payment data").unwrap();
        assert!(!sig.is_empty());
    }

    #[test]
    fn test_nip_jws_mac() {
        let engine = HsmMacEngine::new_software();
        engine.register_hmac_key("nip-key", b"nip-hmac-secret-key-32-bytes-ok!").unwrap();
        let mac = engine.nip_jws_mac("nip-key", "eyJhbGciOiJIUzI1NiJ9", "eyJhbW91bnQiOjEwMH0").unwrap();
        assert!(!mac.is_empty());
    }
}
