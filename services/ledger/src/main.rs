/// nexthub-ledger — Rust HTTP sidecar for the TigerBeetle double-entry ledger.
///
/// Exposes a REST API consumed by the Go bridge for all ledger operations.
/// Uses an in-memory HashMap in dev mode; swap for tigerbeetle-node in production.

use actix_web::{web, App, HttpResponse, HttpServer, middleware::Logger};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

// ─── Domain types ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub id: u64,
    pub credits_posted: u64,
    pub debits_posted: u64,
    pub credits_pending: u64,
    pub debits_pending: u64,
    pub ledger: u32,
    pub code: u16,
    pub user_data: u64,
}

impl Account {
    fn new(id: u64, ledger: u32, code: u16, user_data: u64) -> Self {
        Account {
            id,
            credits_posted: 0,
            debits_posted: 0,
            credits_pending: 0,
            debits_pending: 0,
            ledger,
            code,
            user_data,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transfer {
    pub id: u64,
    pub debit_account_id: u64,
    pub credit_account_id: u64,
    pub amount: u64,
    pub ledger: u32,
    pub code: u16,
    pub flags: u16,
    pub user_data: u64,
    pub pending: bool,
    pub committed: bool,
    pub voided: bool,
    pub timestamp_ms: u64,
}

#[derive(Default)]
pub struct LedgerState {
    accounts: HashMap<u64, Account>,
    transfers: HashMap<u64, Transfer>,
}

type SharedState = Arc<Mutex<LedgerState>>;

// ─── Request types ────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateAccountReq {
    pub id: u64,
    pub ledger: u32,
    pub code: u16,
    pub user_data: Option<u64>,
}

#[derive(Deserialize)]
pub struct CreateTransferReq {
    pub id: Option<u64>,
    pub debit_account_id: u64,
    pub credit_account_id: u64,
    pub amount: u64,
    pub ledger: u32,
    pub code: u16,
    pub flags: Option<u16>,
    pub user_data: Option<u64>,
    pub timeout: Option<u64>,
}

#[derive(Deserialize)]
pub struct CommitReq {
    pub pending_id: u64,
    pub amount: Option<u64>,
}

#[derive(Deserialize)]
pub struct VoidReq {
    pub pending_id: u64,
}

#[derive(Serialize)]
pub struct TransferResult {
    pub id: u64,
    pub result: String,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u64
}

fn now_ns() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos() as u64
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async fn health() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "ok",
        "service": "nexthub-ledger",
        "engine": "in-memory (dev mode)"
    }))
}

async fn create_account(
    state: web::Data<SharedState>,
    req: web::Json<CreateAccountReq>,
) -> HttpResponse {
    let mut l = state.lock().unwrap();
    if l.accounts.contains_key(&req.id) {
        return HttpResponse::Conflict().json(serde_json::json!({"error": "account already exists"}));
    }
    let acc = Account::new(req.id, req.ledger, req.code, req.user_data.unwrap_or(0));
    l.accounts.insert(req.id, acc.clone());
    HttpResponse::Ok().json(acc)
}

async fn lookup_account(
    state: web::Data<SharedState>,
    path: web::Path<u64>,
) -> HttpResponse {
    let l = state.lock().unwrap();
    match l.accounts.get(&path.into_inner()) {
        Some(a) => HttpResponse::Ok().json(a),
        None => HttpResponse::NotFound().json(serde_json::json!({"error": "account not found"})),
    }
}

async fn create_transfer(
    state: web::Data<SharedState>,
    req: web::Json<CreateTransferReq>,
) -> HttpResponse {
    let mut l = state.lock().unwrap();
    let id = req.id.unwrap_or_else(now_ns);
    let pending = req.timeout.unwrap_or(0) > 0;

    if !l.accounts.contains_key(&req.debit_account_id) {
        return HttpResponse::BadRequest().json(serde_json::json!({"error": "debit account not found"}));
    }
    if !l.accounts.contains_key(&req.credit_account_id) {
        return HttpResponse::BadRequest().json(serde_json::json!({"error": "credit account not found"}));
    }

    if pending {
        l.accounts.get_mut(&req.debit_account_id).unwrap().debits_pending += req.amount;
        l.accounts.get_mut(&req.credit_account_id).unwrap().credits_pending += req.amount;
    } else {
        l.accounts.get_mut(&req.debit_account_id).unwrap().debits_posted += req.amount;
        l.accounts.get_mut(&req.credit_account_id).unwrap().credits_posted += req.amount;
    }

    l.transfers.insert(id, Transfer {
        id,
        debit_account_id: req.debit_account_id,
        credit_account_id: req.credit_account_id,
        amount: req.amount,
        ledger: req.ledger,
        code: req.code,
        flags: req.flags.unwrap_or(0),
        user_data: req.user_data.unwrap_or(0),
        pending,
        committed: !pending,
        voided: false,
        timestamp_ms: now_ms(),
    });

    HttpResponse::Ok().json(TransferResult { id, result: "ok".to_string() })
}

async fn commit_transfer(
    state: web::Data<SharedState>,
    req: web::Json<CommitReq>,
) -> HttpResponse {
    let mut l = state.lock().unwrap();
    let (debit_id, credit_id, orig_amount) = match l.transfers.get(&req.pending_id) {
        Some(t) if t.pending && !t.committed && !t.voided => {
            (t.debit_account_id, t.credit_account_id, t.amount)
        }
        Some(_) => return HttpResponse::BadRequest().json(serde_json::json!({"error": "not in pending state"})),
        None => return HttpResponse::NotFound().json(serde_json::json!({"error": "transfer not found"})),
    };
    let amount = req.amount.unwrap_or(orig_amount);
    let t = l.transfers.get_mut(&req.pending_id).unwrap();
    t.committed = true;
    t.pending = false;
    if let Some(a) = l.accounts.get_mut(&debit_id) {
        a.debits_pending = a.debits_pending.saturating_sub(orig_amount);
        a.debits_posted += amount;
    }
    if let Some(a) = l.accounts.get_mut(&credit_id) {
        a.credits_pending = a.credits_pending.saturating_sub(orig_amount);
        a.credits_posted += amount;
    }
    HttpResponse::Ok().json(TransferResult { id: req.pending_id, result: "ok".to_string() })
}

async fn void_transfer(
    state: web::Data<SharedState>,
    req: web::Json<VoidReq>,
) -> HttpResponse {
    let mut l = state.lock().unwrap();
    let (debit_id, credit_id, amount) = match l.transfers.get(&req.pending_id) {
        Some(t) if t.pending && !t.committed && !t.voided => {
            (t.debit_account_id, t.credit_account_id, t.amount)
        }
        Some(_) => return HttpResponse::BadRequest().json(serde_json::json!({"error": "not in pending state"})),
        None => return HttpResponse::NotFound().json(serde_json::json!({"error": "transfer not found"})),
    };
    let t = l.transfers.get_mut(&req.pending_id).unwrap();
    t.voided = true;
    t.pending = false;
    if let Some(a) = l.accounts.get_mut(&debit_id) {
        a.debits_pending = a.debits_pending.saturating_sub(amount);
    }
    if let Some(a) = l.accounts.get_mut(&credit_id) {
        a.credits_pending = a.credits_pending.saturating_sub(amount);
    }
    HttpResponse::Ok().json(TransferResult { id: req.pending_id, result: "ok".to_string() })
}

// ─── Main ─────────────────────────────────────────────────────────────────────

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string()))
        .init();

    let port = std::env::var("LEDGER_PORT").unwrap_or_else(|_| "3902".to_string());
    let addr = format!("0.0.0.0:{}", port);
    tracing::info!("nexthub-ledger listening on {}", addr);

    let state: SharedState = Arc::new(Mutex::new(LedgerState::default()));
    {
        let mut l = state.lock().unwrap();
        l.accounts.insert(1, Account::new(1, 1, 1, 0)); // NGN settlement
        l.accounts.insert(2, Account::new(2, 2, 1, 0)); // CBDC ledger
    }

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(state.clone()))
            .wrap(Logger::default())
            .route("/health",           web::get().to(health))
            .route("/accounts",         web::post().to(create_account))
            .route("/accounts/{id}",    web::get().to(lookup_account))
            .route("/transfers",        web::post().to(create_transfer))
            .route("/transfers/commit", web::post().to(commit_transfer))
            .route("/transfers/void",   web::post().to(void_transfer))
    })
    .bind(&addr)?
    .run()
    .await
}
