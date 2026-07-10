"""
nexthub-lakehouse — Python analytics and audit-trail service.

This service provides:
  - Audit trail ingestion (from Kafka) and query API
  - Compliance report generation (AML, transaction monitoring)
  - Corridor volume aggregation and FX analytics
  - Settlement reconciliation reports
  - DuckDB-powered in-process OLAP queries over Parquet files

Endpoints:
  POST /audit/ingest          — ingest a batch of audit events
  GET  /audit/query           — query audit trail with filters
  POST /reports/aml           — run AML screening report
  POST /reports/settlement    — generate settlement reconciliation report
  POST /reports/corridor      — corridor volume aggregation report
  GET  /analytics/fx-rates    — FX rate time series
  GET  /analytics/volume      — transaction volume by DFSP / corridor
  GET  /health                — liveness probe
"""

import os
import json
import uuid
import logging
from datetime import datetime, timedelta
from typing import Optional, List, Any, Dict

import duckdb
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ─── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("nexthub-lakehouse")

# ─── Configuration ─────────────────────────────────────────────────────────────

DATABASE_URL  = os.getenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/nexthub_db")
KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "localhost:9092")
REDIS_ADDR    = os.getenv("REDIS_ADDR", "localhost:6379")
PARQUET_DIR   = os.getenv("PARQUET_DIR", "/tmp/nexthub-lakehouse")
PORT          = int(os.getenv("LAKEHOUSE_PORT", "8000"))

os.makedirs(PARQUET_DIR, exist_ok=True)

# ─── In-memory store (dev mode — replace with DeltaLake / Iceberg in prod) ────

_audit_events: List[Dict[str, Any]] = []
_fx_rates: List[Dict[str, Any]] = []
_transfers: List[Dict[str, Any]] = []

# ─── FastAPI app ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="NextHub Lakehouse",
    description="Analytics, audit trail, and compliance reporting service",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Pydantic models ──────────────────────────────────────────────────────────

class AuditEvent(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    event_type: str
    actor_id: str
    actor_type: str  # USER | DFSP | SYSTEM
    resource_type: str
    resource_id: str
    action: str
    outcome: str  # SUCCESS | FAILURE
    metadata: Dict[str, Any] = {}
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    ip_address: Optional[str] = None
    session_id: Optional[str] = None

class AuditIngestRequest(BaseModel):
    events: List[AuditEvent]

class AMLReportRequest(BaseModel):
    dfsp_id: Optional[str] = None
    from_date: datetime = Field(default_factory=lambda: datetime.utcnow() - timedelta(days=30))
    to_date: datetime = Field(default_factory=datetime.utcnow)
    threshold_kobo: int = 50_000_000  # 500,000 NGN

class SettlementReportRequest(BaseModel):
    window_id: str
    currency: str = "NGN"

class CorridorReportRequest(BaseModel):
    corridor_id: Optional[str] = None
    from_date: datetime = Field(default_factory=lambda: datetime.utcnow() - timedelta(days=7))
    to_date: datetime = Field(default_factory=datetime.utcnow)
    group_by: str = "day"  # hour | day | week

class TransferIngestRequest(BaseModel):
    transfers: List[Dict[str, Any]]

# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "nexthub-lakehouse",
        "audit_events": len(_audit_events),
        "transfers": len(_transfers),
        "timestamp": datetime.utcnow().isoformat(),
    }

# ─── Audit trail ─────────────────────────────────────────────────────────────

@app.post("/audit/ingest")
def ingest_audit_events(req: AuditIngestRequest):
    """Ingest a batch of audit events into the lakehouse."""
    for event in req.events:
        _audit_events.append(event.model_dump())
    logger.info(f"audit_ingest count={len(req.events)} total={len(_audit_events)}")
    return {"ingested": len(req.events), "total": len(_audit_events)}

@app.get("/audit/query")
def query_audit_trail(
    actor_id: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    resource_id: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    outcome: Optional[str] = Query(None),
    from_date: Optional[datetime] = Query(None),
    to_date: Optional[datetime] = Query(None),
    limit: int = Query(100, le=1000),
    offset: int = Query(0),
):
    """Query the audit trail with optional filters."""
    results = _audit_events

    if actor_id:
        results = [e for e in results if e.get("actor_id") == actor_id]
    if resource_type:
        results = [e for e in results if e.get("resource_type") == resource_type]
    if resource_id:
        results = [e for e in results if e.get("resource_id") == resource_id]
    if action:
        results = [e for e in results if e.get("action") == action]
    if outcome:
        results = [e for e in results if e.get("outcome") == outcome]
    if from_date:
        results = [e for e in results if _parse_dt(e.get("timestamp")) >= from_date]
    if to_date:
        results = [e for e in results if _parse_dt(e.get("timestamp")) <= to_date]

    total = len(results)
    page = results[offset: offset + limit]
    return {"total": total, "offset": offset, "limit": limit, "events": page}

# ─── Transfer ingestion (from Kafka consumer or direct push) ──────────────────

@app.post("/transfers/ingest")
def ingest_transfers(req: TransferIngestRequest):
    """Ingest transfer records for analytics."""
    _transfers.extend(req.transfers)
    logger.info(f"transfer_ingest count={len(req.transfers)} total={len(_transfers)}")
    return {"ingested": len(req.transfers), "total": len(_transfers)}

# ─── AML report ───────────────────────────────────────────────────────────────

@app.post("/reports/aml")
def aml_report(req: AMLReportRequest):
    """
    Generate an AML screening report.
    Flags transfers above the threshold and identifies structuring patterns
    (multiple transfers just below the threshold within a short window).
    """
    if not _transfers:
        return {"report_id": str(uuid.uuid4()), "flagged": [], "summary": {"total_screened": 0, "flagged_count": 0}}

    df = pd.DataFrame(_transfers)
    report_id = str(uuid.uuid4())

    # Filter by date range and DFSP
    if "timestamp" in df.columns:
        df["ts"] = pd.to_datetime(df["timestamp"], errors="coerce")
        df = df[(df["ts"] >= req.from_date) & (df["ts"] <= req.to_date)]
    if req.dfsp_id and "payer_fsp_id" in df.columns:
        df = df[df["payer_fsp_id"] == req.dfsp_id]

    flagged = []

    # Rule 1: Large value transfers
    if "amount_kobo" in df.columns:
        large = df[df["amount_kobo"] >= req.threshold_kobo]
        for _, row in large.iterrows():
            flagged.append({
                "rule": "LARGE_VALUE",
                "transfer_id": row.get("transfer_id", "unknown"),
                "amount_kobo": int(row.get("amount_kobo", 0)),
                "payer_fsp_id": row.get("payer_fsp_id"),
                "payee_fsp_id": row.get("payee_fsp_id"),
            })

    # Rule 2: Rapid succession (structuring detection)
    if "payer_fsp_id" in df.columns and "ts" in df.columns and "amount_kobo" in df.columns:
        structuring_threshold = req.threshold_kobo * 0.9
        for dfsp, group in df.groupby("payer_fsp_id"):
            group = group.sort_values("ts")
            window = group[group["amount_kobo"] < req.threshold_kobo]
            if len(window) >= 3:
                # Check if 3+ transfers within 1 hour
                for i in range(len(window) - 2):
                    t0 = window.iloc[i]["ts"]
                    t2 = window.iloc[i + 2]["ts"]
                    if (t2 - t0).total_seconds() <= 3600:
                        flagged.append({
                            "rule": "STRUCTURING",
                            "payer_fsp_id": dfsp,
                            "transfer_count": 3,
                            "window_seconds": int((t2 - t0).total_seconds()),
                        })
                        break

    return {
        "report_id": report_id,
        "generated_at": datetime.utcnow().isoformat(),
        "from_date": req.from_date.isoformat(),
        "to_date": req.to_date.isoformat(),
        "summary": {
            "total_screened": len(df),
            "flagged_count": len(flagged),
        },
        "flagged": flagged,
    }

# ─── Settlement reconciliation report ────────────────────────────────────────

@app.post("/reports/settlement")
def settlement_report(req: SettlementReportRequest):
    """Generate a settlement reconciliation report for a given window."""
    if not _transfers:
        return {
            "report_id": str(uuid.uuid4()),
            "window_id": req.window_id,
            "currency": req.currency,
            "net_positions": [],
            "total_volume_kobo": 0,
        }

    df = pd.DataFrame(_transfers)
    report_id = str(uuid.uuid4())

    net_positions = []
    if "payer_fsp_id" in df.columns and "payee_fsp_id" in df.columns and "amount_kobo" in df.columns:
        # Compute net position per DFSP
        debits = df.groupby("payer_fsp_id")["amount_kobo"].sum().rename("debits")
        credits = df.groupby("payee_fsp_id")["amount_kobo"].sum().rename("credits")
        positions = pd.concat([debits, credits], axis=1).fillna(0)
        positions["net_kobo"] = positions["credits"] - positions["debits"]
        for dfsp_id, row in positions.iterrows():
            net_positions.append({
                "dfsp_id": dfsp_id,
                "debits_kobo": int(row["debits"]),
                "credits_kobo": int(row["credits"]),
                "net_kobo": int(row["net_kobo"]),
                "position": "CREDITOR" if row["net_kobo"] > 0 else "DEBTOR",
            })

    return {
        "report_id": report_id,
        "window_id": req.window_id,
        "currency": req.currency,
        "generated_at": datetime.utcnow().isoformat(),
        "net_positions": net_positions,
        "total_volume_kobo": int(df["amount_kobo"].sum()) if "amount_kobo" in df.columns else 0,
        "transfer_count": len(df),
    }

# ─── Corridor volume report ───────────────────────────────────────────────────

@app.post("/reports/corridor")
def corridor_report(req: CorridorReportRequest):
    """Generate a corridor volume aggregation report."""
    if not _transfers:
        return {"report_id": str(uuid.uuid4()), "series": [], "total_volume_kobo": 0}

    df = pd.DataFrame(_transfers)
    report_id = str(uuid.uuid4())

    if "timestamp" in df.columns:
        df["ts"] = pd.to_datetime(df["timestamp"], errors="coerce")
        df = df[(df["ts"] >= req.from_date) & (df["ts"] <= req.to_date)]

    if req.corridor_id and "corridor_id" in df.columns:
        df = df[df["corridor_id"] == req.corridor_id]

    series = []
    if "ts" in df.columns and "amount_kobo" in df.columns:
        freq_map = {"hour": "h", "day": "D", "week": "W"}
        freq = freq_map.get(req.group_by, "D")
        df = df.set_index("ts").sort_index()
        grouped = df["amount_kobo"].resample(freq).agg(["sum", "count"]).reset_index()
        for _, row in grouped.iterrows():
            series.append({
                "period": row["ts"].isoformat() if hasattr(row["ts"], "isoformat") else str(row["ts"]),
                "volume_kobo": int(row["sum"]),
                "transfer_count": int(row["count"]),
            })

    return {
        "report_id": report_id,
        "corridor_id": req.corridor_id,
        "from_date": req.from_date.isoformat(),
        "to_date": req.to_date.isoformat(),
        "group_by": req.group_by,
        "generated_at": datetime.utcnow().isoformat(),
        "series": series,
        "total_volume_kobo": sum(s["volume_kobo"] for s in series),
        "total_transfers": sum(s["transfer_count"] for s in series),
    }

# ─── FX analytics ─────────────────────────────────────────────────────────────

@app.get("/analytics/fx-rates")
def fx_rate_analytics(
    currency_pair: Optional[str] = Query(None),
    from_date: Optional[datetime] = Query(None),
    to_date: Optional[datetime] = Query(None),
):
    """Return FX rate time series for a currency pair."""
    results = _fx_rates
    if currency_pair:
        results = [r for r in results if r.get("currency_pair") == currency_pair]
    if from_date:
        results = [r for r in results if _parse_dt(r.get("timestamp")) >= from_date]
    if to_date:
        results = [r for r in results if _parse_dt(r.get("timestamp")) <= to_date]
    return {"currency_pair": currency_pair, "data_points": len(results), "rates": results}

@app.post("/analytics/fx-rates/ingest")
def ingest_fx_rates(rates: List[Dict[str, Any]]):
    """Ingest FX rate snapshots."""
    _fx_rates.extend(rates)
    return {"ingested": len(rates), "total": len(_fx_rates)}

# ─── DuckDB OLAP query endpoint ───────────────────────────────────────────────

@app.post("/analytics/query")
def olap_query(body: Dict[str, Any]):
    """
    Execute a DuckDB SQL query over in-memory DataFrames.
    Supported tables: audit_events, transfers, fx_rates
    """
    sql = body.get("sql", "")
    if not sql:
        raise HTTPException(status_code=400, detail="sql is required")

    # Safety: block DDL and DML
    sql_upper = sql.strip().upper()
    for forbidden in ["DROP", "DELETE", "INSERT", "UPDATE", "CREATE", "ALTER", "TRUNCATE"]:
        if sql_upper.startswith(forbidden):
            raise HTTPException(status_code=400, detail=f"DDL/DML not allowed: {forbidden}")

    try:
        con = duckdb.connect()
        if _audit_events:
            audit_df = pd.DataFrame(_audit_events)
            con.register("audit_events", audit_df)
        if _transfers:
            transfers_df = pd.DataFrame(_transfers)
            con.register("transfers", transfers_df)
        if _fx_rates:
            fx_df = pd.DataFrame(_fx_rates)
            con.register("fx_rates", fx_df)

        result = con.execute(sql).fetchdf()
        con.close()
        return {"rows": len(result), "data": result.to_dict(orient="records")}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ─── Volume analytics ─────────────────────────────────────────────────────────

@app.get("/analytics/volume")
def volume_analytics(
    group_by: str = Query("dfsp", regex="^(dfsp|corridor|currency|day)$"),
    from_date: Optional[datetime] = Query(None),
    to_date: Optional[datetime] = Query(None),
):
    """Return transaction volume grouped by DFSP, corridor, currency, or day."""
    if not _transfers:
        return {"group_by": group_by, "data": []}

    df = pd.DataFrame(_transfers)
    if "timestamp" in df.columns:
        df["ts"] = pd.to_datetime(df["timestamp"], errors="coerce")
        if from_date:
            df = df[df["ts"] >= from_date]
        if to_date:
            df = df[df["ts"] <= to_date]

    if group_by == "dfsp" and "payer_fsp_id" in df.columns:
        grouped = df.groupby("payer_fsp_id").agg(
            volume_kobo=("amount_kobo", "sum"),
            count=("amount_kobo", "count"),
        ).reset_index().rename(columns={"payer_fsp_id": "key"})
    elif group_by == "currency" and "currency" in df.columns:
        grouped = df.groupby("currency").agg(
            volume_kobo=("amount_kobo", "sum"),
            count=("amount_kobo", "count"),
        ).reset_index().rename(columns={"currency": "key"})
    elif group_by == "day" and "ts" in df.columns:
        df["day"] = df["ts"].dt.date.astype(str)
        grouped = df.groupby("day").agg(
            volume_kobo=("amount_kobo", "sum"),
            count=("amount_kobo", "count"),
        ).reset_index().rename(columns={"day": "key"})
    else:
        return {"group_by": group_by, "data": []}

    return {
        "group_by": group_by,
        "data": grouped.to_dict(orient="records"),
    }

# ─── Helpers ──────────────────────────────────────────────────────────────────

def _parse_dt(val: Any) -> datetime:
    if isinstance(val, datetime):
        return val
    if isinstance(val, str):
        try:
            return datetime.fromisoformat(val.replace("Z", "+00:00"))
        except Exception:
            return datetime.min
    return datetime.min

# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False)
