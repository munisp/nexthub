//! Data models for the National Identity Directory

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "alias_type", rename_all = "SCREAMING_SNAKE_CASE")]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AliasType {
    Phone,
    Email,
    Bvn,
    Nin,
    TaxId,
    NationalId,
    PassportNumber,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "alias_status", rename_all = "SCREAMING_SNAKE_CASE")]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AliasStatus {
    Active,
    Suspended,
    Deleted,
}

/// A single alias entry in the National Identity Directory.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AliasEntry {
    pub id:             Uuid,
    pub alias_value:    String,        // e.g. "+2348012345678", "john@bank.ng"
    pub alias_type:     AliasType,
    pub alias_hash:     String,        // SHA-256 of alias_value (for privacy-preserving lookups)
    pub nuban:          String,        // 10-digit NUBAN account number
    pub bank_code:      String,        // 3-digit CBN bank code
    pub bic:            Option<String>,
    pub account_name:   String,
    pub dfsp_id:        String,
    pub tenant_id:      Option<String>,
    pub status:         AliasStatus,
    pub verified:       bool,
    pub verified_at:    Option<DateTime<Utc>>,
    pub created_at:     DateTime<Utc>,
    pub updated_at:     DateTime<Utc>,
}

/// Request body for creating or updating an alias.
#[derive(Debug, Deserialize)]
pub struct CreateAliasRequest {
    pub alias_value:  String,
    pub alias_type:   AliasType,
    pub nuban:        String,
    pub bank_code:    String,
    pub bic:          Option<String>,
    pub account_name: String,
    pub dfsp_id:      String,
    pub tenant_id:    Option<String>,
    pub verified:     Option<bool>,
}

/// Slim response for alias resolution (omits sensitive fields).
#[derive(Debug, Serialize)]
pub struct ResolveResponse {
    pub alias_value:  String,
    pub alias_type:   AliasType,
    pub nuban:        String,
    pub bank_code:    String,
    pub bic:          Option<String>,
    pub account_name: String,
    pub dfsp_id:      String,
    pub verified:     bool,
}

impl From<AliasEntry> for ResolveResponse {
    fn from(e: AliasEntry) -> Self {
        Self {
            alias_value:  e.alias_value,
            alias_type:   e.alias_type,
            nuban:        e.nuban,
            bank_code:    e.bank_code,
            bic:          e.bic,
            account_name: e.account_name,
            dfsp_id:      e.dfsp_id,
            verified:     e.verified,
        }
    }
}
