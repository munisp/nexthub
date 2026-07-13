/*!
face-bias-audit — NextHub Demographic Bias Audit Engine
=======================================================
Language: Rust (high-performance, zero-cost abstractions)
Purpose:  Per-group FAR/FRR tracking, NDPR-compliant audit trail,
          real-time bias reporting for the face biometric pipeline.

Architecture:
  - Axum HTTP server on port 8230
  - PostgreSQL for persistent audit records (sqlx)
  - Redis for real-time sliding-window counters
  - Kafka consumer for bias events from Python face-biometric service
  - Prometheus metrics endpoint

API Endpoints:
  POST /v1/bias/ingest      — Ingest bias events from face-biometric service
  GET  /v1/bias/report      — Full demographic bias report (FAR/FRR per group)
  GET  /v1/bias/report/:op  — Report filtered by operation
  GET  /v1/bias/alert       — Groups exceeding FAR threshold (regulatory alert)
  GET  /health              — Health check
  GET  /metrics             — Prometheus metrics
*/

use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::Arc,
    time::Duration,
};

use anyhow::Result;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use prometheus::{Counter, Gauge, Histogram, HistogramOpts, Opts, Registry, TextEncoder};
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use sqlx::{postgres::PgPoolOptions, PgPool};
use tokio::sync::RwLock;
use tower_http::cors::CorsLayer;
use tracing::{error, info, warn};
use uuid::Uuid;

// ── Config ────────────────────────────────────────────────────────────────────

#[derive(Clone, Debug)]
struct Config {
    database_url:    String,
    redis_url:       String,
    kafka_brokers:   String,
    kafka_topic:     String,
    server_port:     u16,
    far_alert_threshold: f64,
    window_secs:     u64,
}

impl Config {
    fn from_env() -> Self {
        Self {
            database_url:    std::env::var("DATABASE_URL")
                .unwrap_or_else(|_| "postgres://nexthub:nexthub@postgres:5432/nexthub".into()),
            redis_url:       std::env::var("REDIS_URL")
                .unwrap_or_else(|_| "redis://redis:6379".into()),
            kafka_brokers:   std::env::var("KAFKA_BROKERS")
                .unwrap_or_else(|_| "kafka:9092".into()),
            kafka_topic:     std::env::var("BIAS_KAFKA_TOPIC")
                .unwrap_or_else(|_| "nexthub.face.bias.event.v1".into()),
            server_port:     std::env::var("BIAS_AUDIT_PORT")
                .unwrap_or_else(|_| "8230".into())
                .parse()
                .unwrap_or(8230),
            far_alert_threshold: std::env::var("FAR_ALERT_THRESHOLD")
                .unwrap_or_else(|_| "0.10".into())
                .parse()
                .unwrap_or(0.10),
            window_secs:     std::env::var("BIAS_WINDOW_SECS")
                .unwrap_or_else(|_| "3600".into())
                .parse()
                .unwrap_or(3600),
        }
    }
}

// ── Data Models ───────────────────────────────────────────────────────────────

/// Incoming bias event batch from the Python face-biometric service
#[derive(Debug, Deserialize)]
struct BiasIngestRequest {
    timestamp: String,
    events:    Vec<BiasEventEntry>,
}

#[derive(Debug, Deserialize)]
struct BiasEventEntry {
    key:    String,   // "operation:context:age_bracket:gender"
    counts: HashMap<String, u64>,
}

/// Per-group bias statistics
#[derive(Debug, Serialize, Clone)]
struct GroupStats {
    operation:   String,
    context:     String,
    age_bracket: String,
    gender:      String,
    total:       u64,
    passed:      u64,
    failed:      u64,
    /// False Accept Rate = failed / total
    far:         f64,
    /// False Reject Rate (requires ground truth — estimated here)
    frr_estimate: f64,
    window_secs: u64,
    last_updated: String,
}

/// Full bias report
#[derive(Debug, Serialize)]
struct BiasReport {
    generated_at:    String,
    window_secs:     u64,
    total_operations: u64,
    groups:          Vec<GroupStats>,
    alerts:          Vec<BiasAlert>,
    summary:         BiasSummary,
}

/// Alert for groups exceeding FAR threshold
#[derive(Debug, Serialize, Clone)]
struct BiasAlert {
    group_key:       String,
    operation:       String,
    context:         String,
    age_bracket:     String,
    gender:          String,
    far:             f64,
    threshold:       f64,
    severity:        String,   // "warning" | "critical"
    recommendation:  String,
}

/// Summary statistics across all groups
#[derive(Debug, Serialize)]
struct BiasSummary {
    max_far:         f64,
    min_far:         f64,
    mean_far:        f64,
    max_far_group:   Option<String>,
    min_far_group:   Option<String>,
    groups_above_threshold: u64,
    demographic_parity_gap: f64,   // max_far - min_far
}

// ── Prometheus Metrics ────────────────────────────────────────────────────────

#[derive(Clone)]
struct Metrics {
    events_ingested:    Counter,
    groups_tracked:     Gauge,
    alerts_triggered:   Counter,
    ingest_latency:     Histogram,
    report_latency:     Histogram,
    registry:           Arc<Registry>,
}

impl Metrics {
    fn new() -> Result<Self> {
        let registry = Arc::new(Registry::new());
        let events_ingested = Counter::with_opts(
            Opts::new("bias_events_ingested_total", "Total bias events ingested"))?;
        let groups_tracked = Gauge::with_opts(
            Opts::new("bias_groups_tracked", "Number of demographic groups tracked"))?;
        let alerts_triggered = Counter::with_opts(
            Opts::new("bias_alerts_triggered_total", "Total bias alerts triggered"))?;
        let ingest_latency = Histogram::with_opts(
            HistogramOpts::new("bias_ingest_latency_seconds", "Ingest latency")
                .buckets(vec![0.001, 0.005, 0.01, 0.05, 0.1, 0.5]))?;
        let report_latency = Histogram::with_opts(
            HistogramOpts::new("bias_report_latency_seconds", "Report generation latency")
                .buckets(vec![0.001, 0.005, 0.01, 0.05, 0.1, 0.5]))?;
        registry.register(Box::new(events_ingested.clone()))?;
        registry.register(Box::new(groups_tracked.clone()))?;
        registry.register(Box::new(alerts_triggered.clone()))?;
        registry.register(Box::new(ingest_latency.clone()))?;
        registry.register(Box::new(report_latency.clone()))?;
        Ok(Self { events_ingested, groups_tracked, alerts_triggered,
                  ingest_latency, report_latency, registry })
    }
}

// ── App State ─────────────────────────────────────────────────────────────────

#[derive(Clone)]
struct AppState {
    db:      PgPool,
    redis:   redis::aio::ConnectionManager,
    metrics: Metrics,
    config:  Config,
    /// In-memory cache of group stats (refreshed every 30s)
    cache:   Arc<RwLock<HashMap<String, GroupStats>>>,
}

// ── Main ──────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("face_bias_audit=info".parse()?),
        )
        .init();

    let config = Config::from_env();
    info!("face_bias_audit starting port={}", config.server_port);

    // PostgreSQL
    let db = PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(5))
        .connect(&config.database_url)
        .await
        .unwrap_or_else(|e| {
            warn!("postgres_unavailable: {} — running in memory-only mode", e);
            // We'll handle None db gracefully in handlers
            panic!("Cannot start without DB: {}", e)
        });

    // Run migrations
    run_migrations(&db).await?;

    // Redis
    let redis_client = redis::Client::open(config.redis_url.clone())?;
    let redis_conn = redis::aio::ConnectionManager::new(redis_client).await
        .unwrap_or_else(|e| { warn!("redis_unavailable: {}", e); panic!("Redis required: {}", e) });

    let metrics = Metrics::new()?;

    let state = AppState {
        db,
        redis: redis_conn,
        metrics,
        config: config.clone(),
        cache: Arc::new(RwLock::new(HashMap::new())),
    };

    // Background cache refresh task
    let state_clone = state.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(30)).await;
            if let Err(e) = refresh_cache(&state_clone).await {
                warn!("cache_refresh_failed: {}", e);
            }
        }
    });

    // Kafka consumer task
    let state_kafka = state.clone();
    let kafka_config = config.clone();
    tokio::spawn(async move {
        run_kafka_consumer(state_kafka, kafka_config).await;
    });

    // HTTP server
    let app = Router::new()
        .route("/health",              get(health_handler))
        .route("/metrics",             get(metrics_handler))
        .route("/v1/bias/ingest",      post(ingest_handler))
        .route("/v1/bias/report",      get(report_handler))
        .route("/v1/bias/report/:op",  get(report_by_op_handler))
        .route("/v1/bias/alert",       get(alert_handler))
        // NINAuth consent + VC audit trail
        .route("/v1/ninauth/consent-audit",    post(ingest_ninauth_consent))
        .route("/v1/ninauth/face-match-audit", post(ingest_nin_face_match_audit))
        .route("/v1/ninauth/vc-audit",         post(ingest_vc_audit))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], config.server_port));
    info!("face_bias_audit listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

// ── DB Migrations ─────────────────────────────────────────────────────────────

async fn run_migrations(db: &PgPool) -> Result<()> {
    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS face_bias_events (
            id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            operation       TEXT        NOT NULL,
            context         TEXT        NOT NULL,
            age_bracket     TEXT        NOT NULL,
            gender          TEXT        NOT NULL,
            total           BIGINT      NOT NULL DEFAULT 0,
            passed          BIGINT      NOT NULL DEFAULT 0,
            failed          BIGINT      NOT NULL DEFAULT 0,
            far             FLOAT8      NOT NULL DEFAULT 0.0,
            window_start    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    "#).execute(db).await?;

    sqlx::query(r#"
        CREATE INDEX IF NOT EXISTS idx_bias_events_op_ctx
        ON face_bias_events (operation, context, age_bracket, gender)
    "#).execute(db).await?;

    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS face_bias_alerts (
            id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            group_key       TEXT        NOT NULL,
            operation       TEXT        NOT NULL,
            context         TEXT        NOT NULL,
            age_bracket     TEXT        NOT NULL,
            gender          TEXT        NOT NULL,
            far             FLOAT8      NOT NULL,
            threshold       FLOAT8      NOT NULL,
            severity        TEXT        NOT NULL,
            recommendation  TEXT        NOT NULL,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            resolved_at     TIMESTAMPTZ
        )
    "#).execute(db).await?;

    // NINAuth consent audit table
    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS ninauth_consent_audit (
            id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            event_type      TEXT        NOT NULL,
            nin_hash        TEXT        NOT NULL,
            partner_id      TEXT,
            scopes          TEXT[]      NOT NULL DEFAULT '{}',
            purpose         TEXT,
            ip_address      TEXT,
            user_agent      TEXT,
            session_id      TEXT,
            recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    "#).execute(db).await?;

    sqlx::query(r#"
        CREATE INDEX IF NOT EXISTS idx_ninauth_consent_nin_hash
        ON ninauth_consent_audit (nin_hash, recorded_at DESC)
    "#).execute(db).await?;

    // NINAuth face-match audit table
    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS ninauth_face_match_audit (
            id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            nin_prefix          TEXT        NOT NULL,
            verified            BOOLEAN     NOT NULL,
            similarity          FLOAT8      NOT NULL,
            liveness_passed     BOOLEAN     NOT NULL,
            liveness_score      FLOAT8      NOT NULL,
            match_type          TEXT        NOT NULL,
            context             TEXT        NOT NULL,
            partner_id          TEXT,
            assertion_jwt_id    TEXT,
            recorded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    "#).execute(db).await?;

    sqlx::query(r#"
        CREATE INDEX IF NOT EXISTS idx_ninauth_face_match_partner
        ON ninauth_face_match_audit (partner_id, recorded_at DESC)
    "#).execute(db).await?;

    // W3C Verifiable Credential audit table
    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS ninauth_vc_audit (
            id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            vc_id               TEXT        NOT NULL,
            issuer              TEXT        NOT NULL,
            subject_nin_hash    TEXT        NOT NULL,
            valid               BOOLEAN     NOT NULL,
            partner_id          TEXT,
            error               TEXT,
            recorded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    "#).execute(db).await?;

    sqlx::query(r#"
        CREATE INDEX IF NOT EXISTS idx_ninauth_vc_subject
        ON ninauth_vc_audit (subject_nin_hash, recorded_at DESC)
    "#).execute(db).await?;

    info!("db_migrations_complete");
    Ok(())
}

// ── Kafka Consumer ────────────────────────────────────────────────────────────

async fn run_kafka_consumer(state: AppState, config: Config) {
    use rdkafka::consumer::{Consumer, StreamConsumer};
    use rdkafka::ClientConfig;
    use rdkafka::message::Message;
    use futures::StreamExt;

    let consumer: StreamConsumer = match ClientConfig::new()
        .set("bootstrap.servers", &config.kafka_brokers)
        .set("group.id", "face-bias-audit")
        .set("auto.offset.reset", "latest")
        .set("enable.auto.commit", "true")
        .create()
    {
        Ok(c) => c,
        Err(e) => { warn!("kafka_consumer_create_failed: {}", e); return; }
    };

    if let Err(e) = consumer.subscribe(&[&config.kafka_topic]) {
        warn!("kafka_subscribe_failed: {}", e); return;
    }

    info!("kafka_consumer_started topic={}", config.kafka_topic);
    let mut stream = consumer.stream();

    while let Some(msg_result) = stream.next().await {
        match msg_result {
            Ok(msg) => {
                if let Some(payload) = msg.payload() {
                    if let Ok(req) = serde_json::from_slice::<BiasIngestRequest>(payload) {
                        if let Err(e) = process_ingest(&state, req).await {
                            warn!("kafka_ingest_failed: {}", e);
                        }
                    }
                }
            }
            Err(e) => warn!("kafka_message_error: {}", e),
        }
    }
}

// ── Core Ingest Logic ─────────────────────────────────────────────────────────

async fn process_ingest(state: &AppState, req: BiasIngestRequest) -> Result<()> {
    let timer = state.metrics.ingest_latency.start_timer();
    let mut redis = state.redis.clone();

    for entry in &req.events {
        let parts: Vec<&str> = entry.key.split(':').collect();
        if parts.len() != 4 { continue; }
        let (op, ctx, age_bracket, gender) = (parts[0], parts[1], parts[2], parts[3]);
        let total  = entry.counts.get("total").copied().unwrap_or(0);
        let passed = entry.counts.get("passed").copied().unwrap_or(0);
        let failed = entry.counts.get("failed").copied().unwrap_or(0);

        // Update Redis sliding-window counters (expire after window_secs)
        let redis_key = format!("bias:{}:{}:{}:{}", op, ctx, age_bracket, gender);
        let _: () = redis.hincr(&redis_key, "total",  total  as i64).await.unwrap_or(());
        let _: () = redis.hincr(&redis_key, "passed", passed as i64).await.unwrap_or(());
        let _: () = redis.hincr(&redis_key, "failed", failed as i64).await.unwrap_or(());
        let _: () = redis.expire(&redis_key, state.config.window_secs as i64).await.unwrap_or(());

        // Upsert to PostgreSQL for persistent audit trail (NDPR compliance)
        let far = if total > 0 { failed as f64 / total as f64 } else { 0.0 };
        sqlx::query(r#"
            INSERT INTO face_bias_events
                (operation, context, age_bracket, gender, total, passed, failed, far, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            ON CONFLICT DO NOTHING
        "#)
        .bind(op).bind(ctx).bind(age_bracket).bind(gender)
        .bind(total as i64).bind(passed as i64).bind(failed as i64).bind(far)
        .execute(&state.db).await.unwrap_or_else(|e| {
            warn!("db_upsert_failed: {}", e);
            sqlx::postgres::PgQueryResult::default()
        });

        // Check FAR threshold and create alert if exceeded
        if far >= state.config.far_alert_threshold && total >= 10 {
            let severity = if far >= state.config.far_alert_threshold * 2.0 { "critical" } else { "warning" };
            let recommendation = format!(
                "Group {}:{} in {} context has FAR={:.2}% (threshold={:.2}%). \
                 Review threshold configuration or investigate data quality for this demographic.",
                age_bracket, gender, ctx, far * 100.0, state.config.far_alert_threshold * 100.0
            );
            sqlx::query(r#"
                INSERT INTO face_bias_alerts
                    (group_key, operation, context, age_bracket, gender, far, threshold, severity, recommendation)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            "#)
            .bind(&entry.key).bind(op).bind(ctx).bind(age_bracket).bind(gender)
            .bind(far).bind(state.config.far_alert_threshold).bind(severity).bind(&recommendation)
            .execute(&state.db).await.unwrap_or_else(|e| {
                warn!("alert_insert_failed: {}", e);
                sqlx::postgres::PgQueryResult::default()
            });
            state.metrics.alerts_triggered.inc();
        }

        state.metrics.events_ingested.inc_by(total as f64);
    }

    timer.observe_duration();
    Ok(())
}

// ── Cache Refresh ─────────────────────────────────────────────────────────────

async fn refresh_cache(state: &AppState) -> Result<()> {
    let mut redis = state.redis.clone();
    let keys: Vec<String> = redis.keys("bias:*").await.unwrap_or_default();
    let mut new_cache = HashMap::new();

    for key in &keys {
        let parts: Vec<&str> = key.splitn(5, ':').collect();
        if parts.len() != 5 { continue; }
        let (op, ctx, age_bracket, gender) = (parts[1], parts[2], parts[3], parts[4]);
        let total:  i64 = redis.hget(key, "total").await.unwrap_or(0);
        let passed: i64 = redis.hget(key, "passed").await.unwrap_or(0);
        let failed: i64 = redis.hget(key, "failed").await.unwrap_or(0);
        let far = if total > 0 { failed as f64 / total as f64 } else { 0.0 };
        let frr_estimate = if total > 0 { (total - passed) as f64 / total as f64 } else { 0.0 };
        let group_key = format!("{}:{}:{}:{}", op, ctx, age_bracket, gender);
        new_cache.insert(group_key.clone(), GroupStats {
            operation:    op.to_string(),
            context:      ctx.to_string(),
            age_bracket:  age_bracket.to_string(),
            gender:       gender.to_string(),
            total:        total as u64,
            passed:       passed as u64,
            failed:       failed as u64,
            far:          (far * 10000.0).round() / 10000.0,
            frr_estimate: (frr_estimate * 10000.0).round() / 10000.0,
            window_secs:  state.config.window_secs,
            last_updated: Utc::now().to_rfc3339(),
        });
    }

    state.metrics.groups_tracked.set(new_cache.len() as f64);
    let mut cache = state.cache.write().await;
    *cache = new_cache;
    Ok(())
}

// ── HTTP Handlers ─────────────────────────────────────────────────────────────

async fn health_handler(State(state): State<AppState>) -> impl IntoResponse {
    let db_ok = sqlx::query("SELECT 1").fetch_one(&state.db).await.is_ok();
    let mut redis = state.redis.clone();
    let redis_ok: bool = redis.ping::<String>().await.map(|r| r == "PONG").unwrap_or(false);
    Json(serde_json::json!({
        "status": if db_ok && redis_ok { "ok" } else { "degraded" },
        "version": "1.0.0",
        "postgres": db_ok,
        "redis": redis_ok,
    }))
}

async fn metrics_handler(State(state): State<AppState>) -> impl IntoResponse {
    let encoder = TextEncoder::new();
    let metric_families = state.metrics.registry.gather();
    let mut buf = Vec::new();
    encoder.encode(&metric_families, &mut buf).unwrap_or(());
    (
        [(axum::http::header::CONTENT_TYPE, "text/plain; version=0.0.4")],
        buf,
    )
}

async fn ingest_handler(
    State(state): State<AppState>,
    Json(req): Json<BiasIngestRequest>,
) -> impl IntoResponse {
    match process_ingest(&state, req).await {
        Ok(_)  => (StatusCode::OK, Json(serde_json::json!({"status":"ok"}))),
        Err(e) => {
            error!("ingest_error: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()})))
        }
    }
}

async fn report_handler(State(state): State<AppState>) -> impl IntoResponse {
    let timer = state.metrics.report_latency.start_timer();
    let cache = state.cache.read().await;
    let groups: Vec<GroupStats> = cache.values().cloned().collect();
    let report = build_report(groups, state.config.far_alert_threshold, state.config.window_secs);
    timer.observe_duration();
    Json(report)
}

async fn report_by_op_handler(
    State(state): State<AppState>,
    Path(op): Path<String>,
) -> impl IntoResponse {
    let cache = state.cache.read().await;
    let groups: Vec<GroupStats> = cache.values()
        .filter(|g| g.operation == op)
        .cloned()
        .collect();
    let report = build_report(groups, state.config.far_alert_threshold, state.config.window_secs);
    Json(report)
}

async fn alert_handler(State(state): State<AppState>) -> impl IntoResponse {
    let cache = state.cache.read().await;
    let alerts: Vec<BiasAlert> = cache.values()
        .filter(|g| g.far >= state.config.far_alert_threshold && g.total >= 10)
        .map(|g| {
            let severity = if g.far >= state.config.far_alert_threshold * 2.0 { "critical" } else { "warning" };
            BiasAlert {
                group_key:    format!("{}:{}:{}:{}", g.operation, g.context, g.age_bracket, g.gender),
                operation:    g.operation.clone(),
                context:      g.context.clone(),
                age_bracket:  g.age_bracket.clone(),
                gender:       g.gender.clone(),
                far:          g.far,
                threshold:    state.config.far_alert_threshold,
                severity:     severity.to_string(),
                recommendation: format!(
                    "Group {}/{} in {} context has FAR={:.2}%. Review threshold or data quality.",
                    g.age_bracket, g.gender, g.context, g.far * 100.0
                ),
            }
        })
        .collect();
    Json(serde_json::json!({
        "alert_count": alerts.len(),
        "threshold": state.config.far_alert_threshold,
        "alerts": alerts,
        "generated_at": Utc::now().to_rfc3339(),
    }))
}

// ── Report Builder ────────────────────────────────────────────────────────────

fn build_report(groups: Vec<GroupStats>, threshold: f64, window_secs: u64) -> BiasReport {
    let total_ops: u64 = groups.iter().map(|g| g.total).sum();
    let alerts: Vec<BiasAlert> = groups.iter()
        .filter(|g| g.far >= threshold && g.total >= 10)
        .map(|g| {
            let severity = if g.far >= threshold * 2.0 { "critical" } else { "warning" };
            BiasAlert {
                group_key:    format!("{}:{}:{}:{}", g.operation, g.context, g.age_bracket, g.gender),
                operation:    g.operation.clone(),
                context:      g.context.clone(),
                age_bracket:  g.age_bracket.clone(),
                gender:       g.gender.clone(),
                far:          g.far,
                threshold,
                severity:     severity.to_string(),
                recommendation: format!(
                    "Group {}/{} in {} context has FAR={:.2}% (threshold={:.2}%). \
                     Investigate data quality and consider threshold recalibration.",
                    g.age_bracket, g.gender, g.context, g.far * 100.0, threshold * 100.0
                ),
            }
        })
        .collect();

    let fars: Vec<f64> = groups.iter().filter(|g| g.total >= 5).map(|g| g.far).collect();
    let max_far = fars.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let min_far = fars.iter().cloned().fold(f64::INFINITY, f64::min);
    let mean_far = if fars.is_empty() { 0.0 } else { fars.iter().sum::<f64>() / fars.len() as f64 };
    let max_far_group = groups.iter().filter(|g| g.total >= 5)
        .max_by(|a, b| a.far.partial_cmp(&b.far).unwrap_or(std::cmp::Ordering::Equal))
        .map(|g| format!("{}:{}:{}:{}", g.operation, g.context, g.age_bracket, g.gender));
    let min_far_group = groups.iter().filter(|g| g.total >= 5)
        .min_by(|a, b| a.far.partial_cmp(&b.far).unwrap_or(std::cmp::Ordering::Equal))
        .map(|g| format!("{}:{}:{}:{}", g.operation, g.context, g.age_bracket, g.gender));
    let groups_above = groups.iter().filter(|g| g.far >= threshold && g.total >= 10).count() as u64;
    let dp_gap = if max_far.is_finite() && min_far.is_finite() { max_far - min_far } else { 0.0 };

    BiasReport {
        generated_at:     Utc::now().to_rfc3339(),
        window_secs,
        total_operations: total_ops,
        groups,
        alerts,
        summary: BiasSummary {
            max_far:                  (max_far * 10000.0).round() / 10000.0,
            min_far:                  (min_far * 10000.0).round() / 10000.0,
            mean_far:                 (mean_far * 10000.0).round() / 10000.0,
            max_far_group,
            min_far_group,
            groups_above_threshold:   groups_above,
            demographic_parity_gap:   (dp_gap * 10000.0).round() / 10000.0,
        },
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// NINAuth Consent Audit Trail & Verifiable Credential Storage
// ═══════════════════════════════════════════════════════════════════════════════
//
// These endpoints receive events from the Go bridge and store them in PostgreSQL
// for NDPR-compliant audit and regulatory reporting.

/// NINAuth consent event ingested from the Go bridge.
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct NINAuthConsentEvent {
    pub event_type:   String,          // "NINAUTH_CONSENT_GRANTED" | "NINAUTH_CONSENT_REVOKED"
    pub nin_hash:     String,          // SHA-256 of NIN — never store raw NIN
    pub partner_id:   Option<String>,
    pub scopes:       Vec<String>,
    pub purpose:      Option<String>,
    pub ip_address:   Option<String>,
    pub user_agent:   Option<String>,
    pub session_id:   Option<String>,
}

/// NIN face-match audit event.
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct NINFaceMatchAuditEvent {
    pub nin_prefix:      String,       // first 4 digits + "*******"
    pub verified:        bool,
    pub similarity:      f64,
    pub liveness_passed: bool,
    pub liveness_score:  f64,
    pub match_type:      String,       // "face_match" | "nin_verify" | "vc_verify"
    pub context:         String,       // "government" | "payment" | "border" | "event"
    pub partner_id:      Option<String>,
    pub assertion_jwt_id: Option<String>,
}

/// W3C Verifiable Credential audit record.
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct VCVerifyAuditEvent {
    pub vc_id:       String,
    pub issuer:      String,
    pub subject_nin_hash: String,
    pub valid:       bool,
    pub verified_at: String,
    pub partner_id:  Option<String>,
    pub error:       Option<String>,
}

/// Response for audit ingest endpoints.
#[derive(Serialize)]
struct AuditIngestResponse {
    audit_id:    String,
    recorded_at: String,
    status:      String,
}

/// Ingest a NINAuth consent event for NDPR audit.
///
/// POST /v1/ninauth/consent-audit
async fn ingest_ninauth_consent(
    State(state): State<Arc<AppState>>,
    Json(event): Json<NINAuthConsentEvent>,
) -> impl IntoResponse {
    let audit_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    // Persist to PostgreSQL
    let result = sqlx::query!(
        r#"
        INSERT INTO ninauth_consent_audit
            (id, event_type, nin_hash, partner_id, scopes, purpose,
             ip_address, user_agent, session_id, recorded_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        "#,
        audit_id,
        event.event_type,
        event.nin_hash,
        event.partner_id,
        &event.scopes,
        event.purpose,
        event.ip_address,
        event.user_agent,
        event.session_id,
    )
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => {
            info!(audit_id = %audit_id, event_type = %event.event_type, "ninauth_consent_audited");
            (
                StatusCode::CREATED,
                Json(AuditIngestResponse {
                    audit_id,
                    recorded_at: now,
                    status: "recorded".into(),
                }),
            )
        }
        Err(e) => {
            error!(error = %e, "ninauth_consent_audit_db_failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(AuditIngestResponse {
                    audit_id,
                    recorded_at: now,
                    status: format!("error: {e}"),
                }),
            )
        }
    }
}

/// Ingest a NIN face-match audit event.
///
/// POST /v1/ninauth/face-match-audit
async fn ingest_nin_face_match_audit(
    State(state): State<Arc<AppState>>,
    Json(event): Json<NINFaceMatchAuditEvent>,
) -> impl IntoResponse {
    let audit_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    let result = sqlx::query!(
        r#"
        INSERT INTO ninauth_face_match_audit
            (id, nin_prefix, verified, similarity, liveness_passed, liveness_score,
             match_type, context, partner_id, assertion_jwt_id, recorded_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        "#,
        audit_id,
        event.nin_prefix,
        event.verified,
        event.similarity,
        event.liveness_passed,
        event.liveness_score,
        event.match_type,
        event.context,
        event.partner_id,
        event.assertion_jwt_id,
    )
    .execute(&state.db)
    .await;

    // Also feed into bias counters if we have demographic context
    if event.verified || !event.verified {
        let _ = ingest_bias_event_internal(
            &state,
            BiasEvent {
                operation:    event.match_type.clone(),
                context:      event.context.clone(),
                accepted:     event.verified,
                genuine:      event.verified, // best-effort; ABIS ground truth not available here
                age_bracket:  "unknown".into(),
                gender:       "unknown".into(),
                partner_id:   event.partner_id.clone(),
            },
        ).await;
    }

    match result {
        Ok(_) => {
            info!(audit_id = %audit_id, "nin_face_match_audited");
            (
                StatusCode::CREATED,
                Json(AuditIngestResponse {
                    audit_id,
                    recorded_at: now,
                    status: "recorded".into(),
                }),
            )
        }
        Err(e) => {
            error!(error = %e, "nin_face_match_audit_db_failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(AuditIngestResponse {
                    audit_id,
                    recorded_at: now,
                    status: format!("error: {e}"),
                }),
            )
        }
    }
}

/// Ingest a W3C Verifiable Credential verification audit event.
///
/// POST /v1/ninauth/vc-audit
async fn ingest_vc_audit(
    State(state): State<Arc<AppState>>,
    Json(event): Json<VCVerifyAuditEvent>,
) -> impl IntoResponse {
    let audit_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    let result = sqlx::query!(
        r#"
        INSERT INTO ninauth_vc_audit
            (id, vc_id, issuer, subject_nin_hash, valid, partner_id, error, recorded_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        "#,
        audit_id,
        event.vc_id,
        event.issuer,
        event.subject_nin_hash,
        event.valid,
        event.partner_id,
        event.error,
    )
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => {
            info!(audit_id = %audit_id, vc_id = %event.vc_id, "vc_audit_recorded");
            (
                StatusCode::CREATED,
                Json(AuditIngestResponse {
                    audit_id,
                    recorded_at: now,
                    status: "recorded".into(),
                }),
            )
        }
        Err(e) => {
            error!(error = %e, "vc_audit_db_failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(AuditIngestResponse {
                    audit_id,
                    recorded_at: now,
                    status: format!("error: {e}"),
                }),
            )
        }
    }
}

/// Internal helper to feed a bias event without going through HTTP.
async fn ingest_bias_event_internal(state: &Arc<AppState>, event: BiasEvent) -> Result<()> {
    let key = format!(
        "bias:{}:{}:{}:{}",
        event.operation, event.context, event.age_bracket, event.gender
    );
    let mut conn = state.redis.get_multiplexed_async_connection().await?;
    let _: () = conn.incr(format!("{key}:total"), 1).await?;
    if !event.accepted && event.genuine {
        let _: () = conn.incr(format!("{key}:fnmr"), 1).await?;
    }
    if event.accepted && !event.genuine {
        let _: () = conn.incr(format!("{key}:fmr"), 1).await?;
    }
    Ok(())
}

/// Dummy BiasEvent for internal use (mirrors the existing ingest_bias_event handler).
#[derive(Debug)]
struct BiasEvent {
    operation:   String,
    context:     String,
    accepted:    bool,
    genuine:     bool,
    age_bracket: String,
    gender:      String,
    partner_id:  Option<String>,
}
