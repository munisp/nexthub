//! PostgreSQL database connection, migrations, and repository for the identity directory.
//!
//! Tables managed:
//!   dict_aliases            — durable alias → account mapping (the DICT)
//!   identity_lookups        — every alias resolution request (audit trail)
//!   biometric_verifications — BVN/NIN biometric check results from NIBSS/NIMC

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::postgres::PgPoolOptions;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

// ─── Database ─────────────────────────────────────────────────────────────────

pub struct Database {
    pub pool: PgPool,
}

impl Database {
    pub async fn connect(url: &str) -> Result<Self> {
        let pool = PgPoolOptions::new()
            .max_connections(20)
            .min_connections(2)
            .acquire_timeout(std::time::Duration::from_secs(5))
            .connect(url)
            .await?;
        Ok(Self { pool })
    }

    /// Idempotent DDL — safe to run on every startup.
    pub async fn run_migrations(&self) -> Result<()> {
        sqlx::query(r#"
            -- ── Enum types ──────────────────────────────────────────────────────
            DO $$ BEGIN
                CREATE TYPE alias_type AS ENUM (
                    'PHONE', 'EMAIL', 'BVN', 'NIN', 'TAX_ID',
                    'NATIONAL_ID', 'PASSPORT_NUMBER', 'CUSTOM'
                );
            EXCEPTION WHEN duplicate_object THEN NULL; END $$;

            DO $$ BEGIN
                CREATE TYPE alias_status AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');
            EXCEPTION WHEN duplicate_object THEN NULL; END $$;

            DO $$ BEGIN
                CREATE TYPE lookup_result AS ENUM ('HIT', 'MISS', 'ERROR');
            EXCEPTION WHEN duplicate_object THEN NULL; END $$;

            DO $$ BEGIN
                CREATE TYPE biometric_status AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'MISMATCH');
            EXCEPTION WHEN duplicate_object THEN NULL; END $$;

            -- ── dict_aliases ─────────────────────────────────────────────────────
            CREATE TABLE IF NOT EXISTS dict_aliases (
                id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
                alias_value    TEXT        NOT NULL,
                alias_type     alias_type  NOT NULL,
                alias_hash     TEXT        NOT NULL,
                nuban          TEXT        NOT NULL,
                bank_code      TEXT        NOT NULL,
                bic            TEXT,
                account_name   TEXT        NOT NULL,
                dfsp_id        TEXT        NOT NULL,
                tenant_id      TEXT,
                status         alias_status NOT NULL DEFAULT 'ACTIVE',
                verified       BOOLEAN      NOT NULL DEFAULT FALSE,
                verified_at    TIMESTAMPTZ,
                created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
                updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
            );

            CREATE UNIQUE INDEX IF NOT EXISTS idx_dict_aliases_hash
                ON dict_aliases (alias_hash);
            CREATE INDEX IF NOT EXISTS idx_dict_aliases_nuban
                ON dict_aliases (nuban) WHERE status = 'ACTIVE';
            CREATE INDEX IF NOT EXISTS idx_dict_aliases_type_hash
                ON dict_aliases (alias_type, alias_hash) WHERE status = 'ACTIVE';
            CREATE INDEX IF NOT EXISTS idx_dict_aliases_tenant
                ON dict_aliases (tenant_id) WHERE tenant_id IS NOT NULL AND status = 'ACTIVE';

            -- ── identity_lookups ─────────────────────────────────────────────────
            -- Every alias resolution request is recorded for audit, fraud detection,
            -- and rate-limit enforcement.
            CREATE TABLE IF NOT EXISTS identity_lookups (
                id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
                alias_hash      TEXT         NOT NULL,
                alias_type      alias_type   NOT NULL,
                requester_id    TEXT         NOT NULL,   -- DFSP ID or service name
                tenant_id       TEXT,
                result          lookup_result NOT NULL,
                resolved_nuban  TEXT,                    -- populated on HIT
                resolved_bank   TEXT,
                cache_hit       BOOLEAN      NOT NULL DEFAULT FALSE,
                latency_ms      INTEGER,                 -- round-trip latency
                ip_address      TEXT,
                correlation_id  TEXT,
                created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
            );

            CREATE INDEX IF NOT EXISTS idx_identity_lookups_alias_hash
                ON identity_lookups (alias_hash, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_identity_lookups_requester
                ON identity_lookups (requester_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_identity_lookups_tenant
                ON identity_lookups (tenant_id, created_at DESC)
                WHERE tenant_id IS NOT NULL;

            -- ── biometric_verifications ──────────────────────────────────────────
            -- Records every BVN/NIN biometric check result from NIBSS/NIMC.
            CREATE TABLE IF NOT EXISTS biometric_verifications (
                id                  UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id           TEXT,
                requester_id        TEXT              NOT NULL,
                alias_id            UUID              REFERENCES dict_aliases(id) ON DELETE SET NULL,
                verification_type   TEXT              NOT NULL,  -- 'BVN' | 'NIN' | 'FACE' | 'FINGERPRINT'
                identity_number     TEXT              NOT NULL,  -- BVN or NIN (hashed in prod)
                status              biometric_status  NOT NULL DEFAULT 'PENDING',
                provider            TEXT              NOT NULL DEFAULT 'NIBSS',
                provider_ref        TEXT,                        -- NIBSS transaction reference
                match_score         NUMERIC(5,2),                -- 0.00–100.00
                name_match          BOOLEAN,
                dob_match           BOOLEAN,
                phone_match         BOOLEAN,
                failure_reason      TEXT,
                raw_response        JSONB,                       -- full provider response (encrypted at rest)
                correlation_id      TEXT,
                ip_address          TEXT,
                created_at          TIMESTAMPTZ       NOT NULL DEFAULT now(),
                updated_at          TIMESTAMPTZ       NOT NULL DEFAULT now()
            );

            CREATE INDEX IF NOT EXISTS idx_biometric_verifications_alias
                ON biometric_verifications (alias_id, created_at DESC)
                WHERE alias_id IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_biometric_verifications_requester
                ON biometric_verifications (requester_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_biometric_verifications_tenant
                ON biometric_verifications (tenant_id, created_at DESC)
                WHERE tenant_id IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_biometric_verifications_status
                ON biometric_verifications (status) WHERE status = 'PENDING';
        "#)
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}

// ─── Repository: Identity Lookups ─────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct IdentityLookupRow {
    pub id:             Uuid,
    pub alias_hash:     String,
    pub alias_type:     String,
    pub requester_id:   String,
    pub tenant_id:      Option<String>,
    pub result:         String,
    pub resolved_nuban: Option<String>,
    pub resolved_bank:  Option<String>,
    pub cache_hit:      bool,
    pub latency_ms:     Option<i32>,
    pub ip_address:     Option<String>,
    pub correlation_id: Option<String>,
    pub created_at:     DateTime<Utc>,
}

pub struct LookupParams {
    pub alias_hash:     String,
    pub alias_type:     String,
    pub requester_id:   String,
    pub tenant_id:      Option<String>,
    pub result:         String,   // "HIT" | "MISS" | "ERROR"
    pub resolved_nuban: Option<String>,
    pub resolved_bank:  Option<String>,
    pub cache_hit:      bool,
    pub latency_ms:     Option<i32>,
    pub ip_address:     Option<String>,
    pub correlation_id: Option<String>,
}

pub async fn record_lookup(pool: &PgPool, p: LookupParams) -> Result<Uuid> {
    let id = Uuid::new_v4();
    sqlx::query(r#"
        INSERT INTO identity_lookups (
            id, alias_hash, alias_type, requester_id, tenant_id,
            result, resolved_nuban, resolved_bank, cache_hit,
            latency_ms, ip_address, correlation_id, created_at
        ) VALUES ($1,$2,$3::alias_type,$4,$5,$6::lookup_result,$7,$8,$9,$10,$11,$12,NOW())
    "#)
    .bind(id)
    .bind(&p.alias_hash)
    .bind(&p.alias_type)
    .bind(&p.requester_id)
    .bind(&p.tenant_id)
    .bind(&p.result)
    .bind(&p.resolved_nuban)
    .bind(&p.resolved_bank)
    .bind(p.cache_hit)
    .bind(p.latency_ms)
    .bind(&p.ip_address)
    .bind(&p.correlation_id)
    .execute(pool)
    .await?;
    Ok(id)
}

// ─── Repository: Biometric Verifications ──────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct BiometricVerificationRow {
    pub id:                 Uuid,
    pub tenant_id:          Option<String>,
    pub requester_id:       String,
    pub alias_id:           Option<Uuid>,
    pub verification_type:  String,
    pub identity_number:    String,
    pub status:             String,
    pub provider:           String,
    pub provider_ref:       Option<String>,
    pub match_score:        Option<f64>,
    pub name_match:         Option<bool>,
    pub dob_match:          Option<bool>,
    pub phone_match:        Option<bool>,
    pub failure_reason:     Option<String>,
    pub correlation_id:     Option<String>,
    pub created_at:         DateTime<Utc>,
    pub updated_at:         DateTime<Utc>,
}

pub struct BiometricParams {
    pub tenant_id:          Option<String>,
    pub requester_id:       String,
    pub alias_id:           Option<Uuid>,
    pub verification_type:  String,
    pub identity_number:    String,
    pub provider:           String,
    pub correlation_id:     Option<String>,
    pub ip_address:         Option<String>,
}

pub async fn create_biometric_verification(pool: &PgPool, p: BiometricParams) -> Result<Uuid> {
    let id = Uuid::new_v4();
    sqlx::query(r#"
        INSERT INTO biometric_verifications (
            id, tenant_id, requester_id, alias_id, verification_type,
            identity_number, status, provider, correlation_id, ip_address,
            created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,'PENDING',$7,$8,$9,NOW(),NOW())
    "#)
    .bind(id)
    .bind(&p.tenant_id)
    .bind(&p.requester_id)
    .bind(p.alias_id)
    .bind(&p.verification_type)
    .bind(&p.identity_number)
    .bind(&p.provider)
    .bind(&p.correlation_id)
    .bind(&p.ip_address)
    .execute(pool)
    .await?;
    Ok(id)
}

pub struct BiometricResultParams {
    pub id:             Uuid,
    pub status:         String,   // "VERIFIED" | "FAILED" | "MISMATCH"
    pub provider_ref:   Option<String>,
    pub match_score:    Option<f64>,
    pub name_match:     Option<bool>,
    pub dob_match:      Option<bool>,
    pub phone_match:    Option<bool>,
    pub failure_reason: Option<String>,
    pub raw_response:   Option<serde_json::Value>,
}

pub async fn update_biometric_result(pool: &PgPool, p: BiometricResultParams) -> Result<()> {
    sqlx::query(r#"
        UPDATE biometric_verifications SET
            status         = $1::biometric_status,
            provider_ref   = $2,
            match_score    = $3,
            name_match     = $4,
            dob_match      = $5,
            phone_match    = $6,
            failure_reason = $7,
            raw_response   = $8,
            updated_at     = NOW()
        WHERE id = $9
    "#)
    .bind(&p.status)
    .bind(&p.provider_ref)
    .bind(p.match_score)
    .bind(p.name_match)
    .bind(p.dob_match)
    .bind(p.phone_match)
    .bind(&p.failure_reason)
    .bind(&p.raw_response)
    .bind(p.id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_biometric_verification(pool: &PgPool, id: Uuid) -> Result<Option<BiometricVerificationRow>> {
    let row = sqlx::query_as::<_, BiometricVerificationRow>(
        "SELECT * FROM biometric_verifications WHERE id = $1"
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}
