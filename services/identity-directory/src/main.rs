//! identity-directory — NextHub National Identity Directory (DICT)
//!
//! This service is the Rust equivalent of Brazil's PIX DICT or India's UPI ID
//! resolver. It maps human-readable aliases (phone numbers, email addresses,
//! national IDs, BVN, NIN) to bank accounts (NUBAN + bank code) with
//! sub-millisecond lookup latency via an in-memory Redis cache backed by
//! PostgreSQL.
//!
//! Architecture:
//!   - Axum HTTP server (REST + JSON) for alias CRUD
//!   - Tonic gRPC server for high-throughput internal resolution (used by
//!     the NIP gateway and the integration API)
//!   - Redis cache with 60-second TTL for hot alias lookups
//!   - Kafka consumer for alias invalidation events
//!   - PostgreSQL for durable alias storage
//!
//! Language: Rust 1.79 (tokio async runtime)

mod alias;
mod cache;
mod db;
mod grpc;
mod kafka;
mod models;

use anyhow::Result;
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
    routing::{delete, get, post, put},
    Router,
};
use serde::{Deserialize, Serialize};
use std::{net::SocketAddr, sync::Arc};
use tokio::signal;
use tower_http::cors::CorsLayer;
use tracing::{error, info};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::models::{AliasEntry, AliasType, CreateAliasRequest, ResolveResponse};

// ─── Application State ────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct AppState {
    pub db:    Arc<db::Database>,
    pub cache: Arc<cache::RedisCache>,
    pub kafka: Arc<kafka::KafkaBridge>,
}

// ─── Main ─────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> Result<()> {
    // Structured JSON logging
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "identity_directory=info".to_string()),
        ))
        .with(tracing_subscriber::fmt::layer().json())
        .init();

    info!("identity_directory.starting");

    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://nexthub:nexthub@postgres:5432/nexthub".to_string());
    let redis_url = std::env::var("REDIS_URL")
        .unwrap_or_else(|_| "redis://redis:6379".to_string());
    let kafka_brokers = std::env::var("KAFKA_BROKERS")
        .unwrap_or_else(|_| "kafka:9092".to_string());
    let http_port: u16 = std::env::var("HTTP_PORT")
        .unwrap_or_else(|_| "8200".to_string())
        .parse()
        .unwrap_or(8200);
    let grpc_port: u16 = std::env::var("GRPC_PORT")
        .unwrap_or_else(|_| "8201".to_string())
        .parse()
        .unwrap_or(8201);

    // ── Initialise dependencies ───────────────────────────────────────────────
    let database = Arc::new(db::Database::connect(&database_url).await?);
    database.run_migrations().await?;

    let redis_cache = Arc::new(cache::RedisCache::connect(&redis_url).await?);
    let kafka_bridge = Arc::new(kafka::KafkaBridge::new(&kafka_brokers)?);

    let state = AppState {
        db:    database.clone(),
        cache: redis_cache.clone(),
        kafka: kafka_bridge.clone(),
    };

    // ── Start Kafka consumer in background ────────────────────────────────────
    let kafka_state = state.clone();
    tokio::spawn(async move {
        if let Err(e) = kafka::run_consumer(kafka_state).await {
            error!("kafka.consumer_failed: {:?}", e);
        }
    });

    // ── Start gRPC server in background ──────────────────────────────────────
    let grpc_state = state.clone();
    tokio::spawn(async move {
        if let Err(e) = grpc::run_grpc_server(grpc_state, grpc_port).await {
            error!("grpc.server_failed: {:?}", e);
        }
    });

    // ── HTTP REST API ─────────────────────────────────────────────────────────
    let app = Router::new()
        .route("/health",                    get(health_handler))
        .route("/v1/aliases",                post(create_alias))
        .route("/v1/aliases/:alias",         get(resolve_alias))
        .route("/v1/aliases/:alias",         put(update_alias))
        .route("/v1/aliases/:alias",         delete(delete_alias))
        .route("/v1/aliases/account/:nuban", get(list_aliases_by_account))
        .route("/v1/aliases/bvn/:bvn",       get(resolve_by_bvn))
        .route("/v1/aliases/nin/:nin",       get(resolve_by_nin))
        .route("/v1/aliases/phone/:phone",   get(resolve_by_phone))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], http_port));
    info!("identity_directory.http_listening addr={}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    info!("identity_directory.stopped");
    Ok(())
}

// ─── HTTP Handlers ────────────────────────────────────────────────────────────

async fn health_handler() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok", "service": "identity-directory" }))
}

async fn create_alias(
    State(state): State<AppState>,
    Json(req): Json<CreateAliasRequest>,
) -> Result<(StatusCode, Json<AliasEntry>), (StatusCode, Json<serde_json::Value>)> {
    match alias::create(&state, req).await {
        Ok(entry) => Ok((StatusCode::CREATED, Json(entry))),
        Err(e) => {
            error!("create_alias.failed: {:?}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            ))
        }
    }
}

async fn resolve_alias(
    State(state): State<AppState>,
    Path(alias_value): Path<String>,
) -> Result<Json<ResolveResponse>, (StatusCode, Json<serde_json::Value>)> {
    match alias::resolve(&state, &alias_value).await {
        Ok(Some(entry)) => Ok(Json(entry)),
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "alias_not_found" })),
        )),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )),
    }
}

async fn update_alias(
    State(state): State<AppState>,
    Path(alias_value): Path<String>,
    Json(req): Json<CreateAliasRequest>,
) -> Result<Json<AliasEntry>, (StatusCode, Json<serde_json::Value>)> {
    match alias::update(&state, &alias_value, req).await {
        Ok(entry) => Ok(Json(entry)),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )),
    }
}

async fn delete_alias(
    State(state): State<AppState>,
    Path(alias_value): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    match alias::delete(&state, &alias_value).await {
        Ok(_) => Ok(Json(serde_json::json!({ "success": true }))),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )),
    }
}

#[derive(Deserialize)]
struct AccountQuery {
    tenant_id: Option<String>,
}

async fn list_aliases_by_account(
    State(state): State<AppState>,
    Path(nuban): Path<String>,
    Query(q): Query<AccountQuery>,
) -> Json<Vec<AliasEntry>> {
    let entries = alias::list_by_account(&state, &nuban, q.tenant_id.as_deref())
        .await
        .unwrap_or_default();
    Json(entries)
}

async fn resolve_by_bvn(
    State(state): State<AppState>,
    Path(bvn): Path<String>,
) -> Result<Json<ResolveResponse>, (StatusCode, Json<serde_json::Value>)> {
    match alias::resolve_by_type(&state, &bvn, AliasType::Bvn).await {
        Ok(Some(r)) => Ok(Json(r)),
        Ok(None) => Err((StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "bvn_not_found" })))),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() })))),
    }
}

async fn resolve_by_nin(
    State(state): State<AppState>,
    Path(nin): Path<String>,
) -> Result<Json<ResolveResponse>, (StatusCode, Json<serde_json::Value>)> {
    match alias::resolve_by_type(&state, &nin, AliasType::Nin).await {
        Ok(Some(r)) => Ok(Json(r)),
        Ok(None) => Err((StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "nin_not_found" })))),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() })))),
    }
}

async fn resolve_by_phone(
    State(state): State<AppState>,
    Path(phone): Path<String>,
) -> Result<Json<ResolveResponse>, (StatusCode, Json<serde_json::Value>)> {
    match alias::resolve_by_type(&state, &phone, AliasType::Phone).await {
        Ok(Some(r)) => Ok(Json(r)),
        Ok(None) => Err((StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "phone_not_found" })))),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() })))),
    }
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c().await.expect("failed to install Ctrl+C handler");
    };
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };
    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
    info!("identity_directory.shutdown_signal_received");
}
