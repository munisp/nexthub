//! Core alias resolution logic for the National Identity Directory.
//!
//! Every resolution request is persisted to `identity_lookups` for audit
//! and fraud-detection purposes. Biometric verification results are persisted
//! to `biometric_verifications`.

use anyhow::Result;
use sha2::{Digest, Sha256};
use std::time::Instant;
use uuid::Uuid;

use crate::{
    db::{
        record_lookup, BiometricParams, BiometricResultParams, LookupParams,
        create_biometric_verification, update_biometric_result,
    },
    models::{AliasEntry, AliasStatus, AliasType, CreateAliasRequest, ResolveResponse},
    AppState,
};

const CACHE_NS: &str = "dict:alias";
const CACHE_TTL_SECS: u64 = 60;

/// Hash an alias value for privacy-preserving storage and cache keys.
pub fn hash_alias(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.to_lowercase().trim().as_bytes());
    hex::encode(hasher.finalize())
}

// ─── Create ───────────────────────────────────────────────────────────────────

pub async fn create(state: &AppState, req: CreateAliasRequest) -> Result<AliasEntry> {
    let alias_hash = hash_alias(&req.alias_value);
    let id = Uuid::new_v4();
    let now = chrono::Utc::now();

    let entry = sqlx::query_as::<_, AliasEntry>(r#"
        INSERT INTO dict_aliases (
            id, alias_value, alias_type, alias_hash,
            nuban, bank_code, bic, account_name, dfsp_id,
            tenant_id, status, verified, created_at, updated_at
        ) VALUES (
            $1, $2, $3::alias_type, $4,
            $5, $6, $7, $8, $9,
            $10, 'ACTIVE'::alias_status, $11, $12, $12
        )
        ON CONFLICT (alias_hash) DO UPDATE SET
            nuban        = EXCLUDED.nuban,
            bank_code    = EXCLUDED.bank_code,
            bic          = EXCLUDED.bic,
            account_name = EXCLUDED.account_name,
            dfsp_id      = EXCLUDED.dfsp_id,
            updated_at   = EXCLUDED.updated_at
        RETURNING *
    "#)
    .bind(id)
    .bind(&req.alias_value)
    .bind(&req.alias_type)
    .bind(&alias_hash)
    .bind(&req.nuban)
    .bind(&req.bank_code)
    .bind(&req.bic)
    .bind(&req.account_name)
    .bind(&req.dfsp_id)
    .bind(&req.tenant_id)
    .bind(req.verified.unwrap_or(false))
    .bind(now)
    .fetch_one(&state.db.pool)
    .await?;

    // Invalidate cache
    state.cache.del(CACHE_NS, &alias_hash).await.ok();

    // Publish Kafka event
    state.kafka.publish_alias_created(&entry).await.ok();

    Ok(entry)
}

// ─── Resolve ──────────────────────────────────────────────────────────────────

/// Resolve an alias by its plain-text value (cache-first).
/// Records every lookup to `identity_lookups` for audit.
pub async fn resolve(
    state: &AppState,
    alias_value: &str,
    requester_id: &str,
    tenant_id: Option<&str>,
    correlation_id: Option<&str>,
    ip_address: Option<&str>,
) -> Result<Option<ResolveResponse>> {
    let alias_hash = hash_alias(alias_value);
    let start = Instant::now();

    // L1: Redis cache
    if let Ok(Some(cached)) = state.cache.get::<ResolveResponse>(CACHE_NS, &alias_hash).await {
        let latency = start.elapsed().as_millis() as i32;
        record_lookup(&state.db.pool, LookupParams {
            alias_hash:     alias_hash.clone(),
            alias_type:     "CUSTOM".to_string(),
            requester_id:   requester_id.to_string(),
            tenant_id:      tenant_id.map(String::from),
            result:         "HIT".to_string(),
            resolved_nuban: Some(cached.nuban.clone()),
            resolved_bank:  Some(cached.bank_code.clone()),
            cache_hit:      true,
            latency_ms:     Some(latency),
            ip_address:     ip_address.map(String::from),
            correlation_id: correlation_id.map(String::from),
        }).await.ok();
        return Ok(Some(cached));
    }

    // L2: PostgreSQL
    let entry = sqlx::query_as::<_, AliasEntry>(
        "SELECT * FROM dict_aliases WHERE alias_hash = $1 AND status = 'ACTIVE'::alias_status LIMIT 1",
    )
    .bind(&alias_hash)
    .fetch_optional(&state.db.pool)
    .await?;

    let latency = start.elapsed().as_millis() as i32;

    match entry {
        None => {
            record_lookup(&state.db.pool, LookupParams {
                alias_hash,
                alias_type:     "CUSTOM".to_string(),
                requester_id:   requester_id.to_string(),
                tenant_id:      tenant_id.map(String::from),
                result:         "MISS".to_string(),
                resolved_nuban: None,
                resolved_bank:  None,
                cache_hit:      false,
                latency_ms:     Some(latency),
                ip_address:     ip_address.map(String::from),
                correlation_id: correlation_id.map(String::from),
            }).await.ok();
            Ok(None)
        }
        Some(e) => {
            let response = ResolveResponse::from(e);
            state.cache.set(CACHE_NS, &alias_hash, &response, CACHE_TTL_SECS).await.ok();
            record_lookup(&state.db.pool, LookupParams {
                alias_hash,
                alias_type:     "CUSTOM".to_string(),
                requester_id:   requester_id.to_string(),
                tenant_id:      tenant_id.map(String::from),
                result:         "HIT".to_string(),
                resolved_nuban: Some(response.nuban.clone()),
                resolved_bank:  Some(response.bank_code.clone()),
                cache_hit:      false,
                latency_ms:     Some(latency),
                ip_address:     ip_address.map(String::from),
                correlation_id: correlation_id.map(String::from),
            }).await.ok();
            Ok(Some(response))
        }
    }
}

/// Resolve an alias by type (BVN, NIN, phone) — records lookup.
pub async fn resolve_by_type(
    state: &AppState,
    value: &str,
    alias_type: AliasType,
    requester_id: &str,
    tenant_id: Option<&str>,
    correlation_id: Option<&str>,
    ip_address: Option<&str>,
) -> Result<Option<ResolveResponse>> {
    let alias_hash = hash_alias(value);
    let type_str   = format!("{:?}", alias_type).to_uppercase();
    let cache_key  = format!("{}:{}", alias_hash, type_str);
    let start      = Instant::now();

    if let Ok(Some(cached)) = state.cache.get::<ResolveResponse>(CACHE_NS, &cache_key).await {
        let latency = start.elapsed().as_millis() as i32;
        record_lookup(&state.db.pool, LookupParams {
            alias_hash:     alias_hash.clone(),
            alias_type:     type_str.clone(),
            requester_id:   requester_id.to_string(),
            tenant_id:      tenant_id.map(String::from),
            result:         "HIT".to_string(),
            resolved_nuban: Some(cached.nuban.clone()),
            resolved_bank:  Some(cached.bank_code.clone()),
            cache_hit:      true,
            latency_ms:     Some(latency),
            ip_address:     ip_address.map(String::from),
            correlation_id: correlation_id.map(String::from),
        }).await.ok();
        return Ok(Some(cached));
    }

    let entry = sqlx::query_as::<_, AliasEntry>(
        "SELECT * FROM dict_aliases WHERE alias_hash = $1 AND alias_type = $2::alias_type AND status = 'ACTIVE'::alias_status LIMIT 1",
    )
    .bind(&alias_hash)
    .bind(&alias_type)
    .fetch_optional(&state.db.pool)
    .await?;

    let latency = start.elapsed().as_millis() as i32;

    match entry {
        None => {
            record_lookup(&state.db.pool, LookupParams {
                alias_hash,
                alias_type:     type_str,
                requester_id:   requester_id.to_string(),
                tenant_id:      tenant_id.map(String::from),
                result:         "MISS".to_string(),
                resolved_nuban: None,
                resolved_bank:  None,
                cache_hit:      false,
                latency_ms:     Some(latency),
                ip_address:     ip_address.map(String::from),
                correlation_id: correlation_id.map(String::from),
            }).await.ok();
            Ok(None)
        }
        Some(e) => {
            let response = ResolveResponse::from(e);
            state.cache.set(CACHE_NS, &cache_key, &response, CACHE_TTL_SECS).await.ok();
            record_lookup(&state.db.pool, LookupParams {
                alias_hash,
                alias_type:     type_str,
                requester_id:   requester_id.to_string(),
                tenant_id:      tenant_id.map(String::from),
                result:         "HIT".to_string(),
                resolved_nuban: Some(response.nuban.clone()),
                resolved_bank:  Some(response.bank_code.clone()),
                cache_hit:      false,
                latency_ms:     Some(latency),
                ip_address:     ip_address.map(String::from),
                correlation_id: correlation_id.map(String::from),
            }).await.ok();
            Ok(Some(response))
        }
    }
}

// ─── Update ───────────────────────────────────────────────────────────────────

pub async fn update(state: &AppState, alias_value: &str, req: CreateAliasRequest) -> Result<AliasEntry> {
    let alias_hash = hash_alias(alias_value);
    let now = chrono::Utc::now();

    let entry = sqlx::query_as::<_, AliasEntry>(r#"
        UPDATE dict_aliases SET
            nuban        = $1,
            bank_code    = $2,
            bic          = $3,
            account_name = $4,
            dfsp_id      = $5,
            updated_at   = $6
        WHERE alias_hash = $7 AND status = 'ACTIVE'::alias_status
        RETURNING *
    "#)
    .bind(&req.nuban)
    .bind(&req.bank_code)
    .bind(&req.bic)
    .bind(&req.account_name)
    .bind(&req.dfsp_id)
    .bind(now)
    .bind(&alias_hash)
    .fetch_one(&state.db.pool)
    .await?;

    state.cache.del(CACHE_NS, &alias_hash).await.ok();
    state.kafka.publish_alias_updated(&entry).await.ok();

    Ok(entry)
}

// ─── Delete (soft) ────────────────────────────────────────────────────────────

pub async fn delete(state: &AppState, alias_value: &str) -> Result<()> {
    let alias_hash = hash_alias(alias_value);

    sqlx::query(
        "UPDATE dict_aliases SET status = 'DELETED'::alias_status, updated_at = now() WHERE alias_hash = $1",
    )
    .bind(&alias_hash)
    .execute(&state.db.pool)
    .await?;

    state.cache.del(CACHE_NS, &alias_hash).await.ok();
    state.kafka.publish_alias_deleted(alias_value).await.ok();

    Ok(())
}

// ─── List by account ──────────────────────────────────────────────────────────

pub async fn list_by_account(
    state: &AppState,
    nuban: &str,
    tenant_id: Option<&str>,
) -> Result<Vec<AliasEntry>> {
    let entries = if let Some(tid) = tenant_id {
        sqlx::query_as::<_, AliasEntry>(
            "SELECT * FROM dict_aliases WHERE nuban = $1 AND tenant_id = $2 AND status = 'ACTIVE'::alias_status ORDER BY created_at DESC",
        )
        .bind(nuban)
        .bind(tid)
        .fetch_all(&state.db.pool)
        .await?
    } else {
        sqlx::query_as::<_, AliasEntry>(
            "SELECT * FROM dict_aliases WHERE nuban = $1 AND status = 'ACTIVE'::alias_status ORDER BY created_at DESC",
        )
        .bind(nuban)
        .fetch_all(&state.db.pool)
        .await?
    };
    Ok(entries)
}

// ─── Biometric Verification ───────────────────────────────────────────────────

pub struct VerifyBiometricRequest {
    pub tenant_id:         Option<String>,
    pub requester_id:      String,
    pub alias_id:          Option<Uuid>,
    pub verification_type: String,
    pub identity_number:   String,
    pub provider:          String,
    pub correlation_id:    Option<String>,
    pub ip_address:        Option<String>,
}

pub struct BiometricVerifyResult {
    pub verification_id: Uuid,
    pub status:          String,
    pub match_score:     Option<f64>,
    pub name_match:      Option<bool>,
    pub dob_match:       Option<bool>,
    pub phone_match:     Option<bool>,
    pub provider_ref:    Option<String>,
    pub failure_reason:  Option<String>,
}

/// Create a PENDING biometric verification record and return its ID.
/// The caller is responsible for calling `complete_biometric_verification`
/// once the provider responds.
pub async fn initiate_biometric_verification(
    state: &AppState,
    req: VerifyBiometricRequest,
) -> Result<Uuid> {
    let id = create_biometric_verification(&state.db.pool, BiometricParams {
        tenant_id:          req.tenant_id,
        requester_id:       req.requester_id,
        alias_id:           req.alias_id,
        verification_type:  req.verification_type,
        identity_number:    req.identity_number,
        provider:           req.provider,
        correlation_id:     req.correlation_id,
        ip_address:         req.ip_address,
    }).await?;
    Ok(id)
}

/// Update a biometric verification record with the provider's response.
pub async fn complete_biometric_verification(
    state: &AppState,
    result: BiometricVerifyResult,
) -> Result<()> {
    // If verified, mark the alias as verified in dict_aliases
    if result.status == "VERIFIED" {
        if let Some(alias_id) = result.verification_id.into() {
            sqlx::query(
                "UPDATE dict_aliases SET verified = TRUE, verified_at = NOW(), updated_at = NOW() WHERE id = $1"
            )
            .bind(alias_id)
            .execute(&state.db.pool)
            .await.ok();
        }
    }

    update_biometric_result(&state.db.pool, BiometricResultParams {
        id:             result.verification_id,
        status:         result.status,
        provider_ref:   result.provider_ref,
        match_score:    result.match_score,
        name_match:     result.name_match,
        dob_match:      result.dob_match,
        phone_match:    result.phone_match,
        failure_reason: result.failure_reason,
        raw_response:   None,
    }).await?;

    Ok(())
}
