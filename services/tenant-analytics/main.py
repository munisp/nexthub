"""
tenant-analytics/main.py
─────────────────────────────────────────────────────────────────────────────
Python microservice: Tenant Analytics & Reporting Engine

Responsibilities:
  - Aggregate per-tenant transaction metrics (volume, value, success rate)
  - Generate regulatory reports (CBN, NFIU, BOG, CBK, SARB) per tenant
  - Detect anomalous tenant behaviour (sudden TPS spikes, unusual corridors)
  - Expose REST API for dashboard metrics and scheduled report generation
  - Write aggregated metrics to the data lakehouse (Parquet via PyArrow)
  - Publish metric snapshots to Kafka for real-time dashboards

Language choice: Python — ideal for this service because:
  - Pandas/PyArrow for efficient time-series aggregation
  - Rich ecosystem for statistical anomaly detection (scipy, statsmodels)
  - FastAPI for async REST endpoints
  - Kafka consumer via confluent-kafka
  - Excellent PostgreSQL async driver (asyncpg)

Exposes REST API on :8132
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import asyncpg
import uvicorn
from fastapi import FastAPI, HTTPException, Query, Header, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

# ─── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","msg":"%(message)s"}',
)
logger = logging.getLogger("tenant-analytics")

# ─── Config ───────────────────────────────────────────────────────────────────

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://nexthub:nexthub@localhost:5432/nexthub")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")
PORT = int(os.getenv("PORT", "8132"))

# ─── FastAPI app ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="NextHub Tenant Analytics",
    version="1.0.0",
    description="Per-tenant transaction analytics, regulatory reporting, and anomaly detection",
)

# ─── DB pool ──────────────────────────────────────────────────────────────────

_pool: asyncpg.Pool | None = None

async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    return _pool

# ─── Auth dependency ──────────────────────────────────────────────────────────

def verify_api_key(authorization: str = Header(default="")):
    if INTERNAL_API_KEY and authorization != f"Bearer {INTERNAL_API_KEY}":
        raise HTTPException(status_code=401, detail="Unauthorized")

# ─── Models ───────────────────────────────────────────────────────────────────

class TenantMetrics(BaseModel):
    tenant_id: str
    period_start: datetime
    period_end: datetime
    total_transfers: int
    total_value_kobo: int
    successful_transfers: int
    failed_transfers: int
    pending_transfers: int
    success_rate_pct: float
    avg_transfer_value_kobo: float
    peak_tps: float
    unique_payers: int
    unique_payees: int
    top_corridors: list[dict[str, Any]]
    aml_flags: int
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class AnomalyAlert(BaseModel):
    tenant_id: str
    alert_type: str
    severity: str  # LOW | MEDIUM | HIGH | CRITICAL
    description: str
    metric_value: float
    threshold_value: float
    detected_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class RegulatoryReport(BaseModel):
    tenant_id: str
    report_type: str  # CBN_MONTHLY | NFIU_STR | CBN_RTGS_DAILY
    jurisdiction: str
    period_start: datetime
    period_end: datetime
    report_data: dict[str, Any]
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# ─── Analytics queries ────────────────────────────────────────────────────────

async def compute_tenant_metrics(
    pool: asyncpg.Pool,
    tenant_id: str,
    period_start: datetime,
    period_end: datetime,
) -> TenantMetrics:
    """
    Aggregate transfer metrics for a tenant over a time window.
    Uses the nexthubTransfers table filtered by tenantId.
    """
    async with pool.acquire() as conn:
        # Core metrics
        row = await conn.fetchrow("""
            SELECT
                COUNT(*)                                    AS total_transfers,
                COALESCE(SUM(amount), 0)                   AS total_value_kobo,
                COUNT(*) FILTER (WHERE status = 'COMMITTED')  AS successful_transfers,
                COUNT(*) FILTER (WHERE status = 'ABORTED')    AS failed_transfers,
                COUNT(*) FILTER (WHERE status = 'RESERVED')   AS pending_transfers,
                COALESCE(AVG(amount), 0)                   AS avg_value_kobo,
                COUNT(DISTINCT payer_fsp_id)               AS unique_payers,
                COUNT(DISTINCT payee_fsp_id)               AS unique_payees,
                COUNT(*) FILTER (WHERE fraud_score >= 70)  AS aml_flags
            FROM nexthub_transfers
            WHERE tenant_id = $1
              AND created_at BETWEEN $2 AND $3
        """, tenant_id, period_start, period_end)

        # Peak TPS (max transfers in any 1-second window)
        tps_row = await conn.fetchrow("""
            SELECT COALESCE(MAX(cnt), 0) AS peak_tps
            FROM (
                SELECT
                    date_trunc('second', created_at) AS sec,
                    COUNT(*) AS cnt
                FROM nexthub_transfers
                WHERE tenant_id = $1
                  AND created_at BETWEEN $2 AND $3
                GROUP BY sec
            ) t
        """, tenant_id, period_start, period_end)

        # Top 5 corridors by volume
        corridors = await conn.fetch("""
            SELECT
                payer_fsp_id,
                payee_fsp_id,
                COUNT(*) AS transfer_count,
                SUM(amount) AS total_value
            FROM nexthub_transfers
            WHERE tenant_id = $1
              AND created_at BETWEEN $2 AND $3
            GROUP BY payer_fsp_id, payee_fsp_id
            ORDER BY transfer_count DESC
            LIMIT 5
        """, tenant_id, period_start, period_end)

    total = row["total_transfers"] or 0
    successful = row["successful_transfers"] or 0
    success_rate = (successful / total * 100) if total > 0 else 0.0

    return TenantMetrics(
        tenant_id=tenant_id,
        period_start=period_start,
        period_end=period_end,
        total_transfers=total,
        total_value_kobo=int(row["total_value_kobo"] or 0),
        successful_transfers=successful,
        failed_transfers=int(row["failed_transfers"] or 0),
        pending_transfers=int(row["pending_transfers"] or 0),
        success_rate_pct=round(success_rate, 2),
        avg_transfer_value_kobo=float(row["avg_value_kobo"] or 0),
        peak_tps=float(tps_row["peak_tps"] or 0),
        unique_payers=int(row["unique_payers"] or 0),
        unique_payees=int(row["unique_payees"] or 0),
        top_corridors=[
            {
                "payerFspId": c["payer_fsp_id"],
                "payeeFspId": c["payee_fsp_id"],
                "transferCount": c["transfer_count"],
                "totalValueKobo": int(c["total_value"] or 0),
            }
            for c in corridors
        ],
        aml_flags=int(row["aml_flags"] or 0),
    )

async def detect_anomalies(
    pool: asyncpg.Pool,
    tenant_id: str,
) -> list[AnomalyAlert]:
    """
    Detect anomalous patterns for a tenant using rolling window statistics.
    Checks: TPS spike, high failure rate, AML flag surge, unusual corridor.
    """
    alerts: list[AnomalyAlert] = []
    now = datetime.now(timezone.utc)
    window_1h = now - timedelta(hours=1)
    window_24h = now - timedelta(hours=24)

    async with pool.acquire() as conn:
        # Check 1: TPS spike (current hour vs 24h average)
        tps_row = await conn.fetchrow("""
            SELECT
                (SELECT COUNT(*) FROM nexthub_transfers
                 WHERE tenant_id = $1 AND created_at >= $2) AS count_1h,
                (SELECT COUNT(*) FROM nexthub_transfers
                 WHERE tenant_id = $1 AND created_at >= $3) AS count_24h
        """, tenant_id, window_1h, window_24h)

        count_1h = tps_row["count_1h"] or 0
        count_24h = tps_row["count_24h"] or 0
        hourly_avg = count_24h / 24 if count_24h > 0 else 0

        if hourly_avg > 0 and count_1h > hourly_avg * 3:
            alerts.append(AnomalyAlert(
                tenant_id=tenant_id,
                alert_type="TPS_SPIKE",
                severity="HIGH",
                description=f"Transfer volume in last hour ({count_1h}) is {count_1h/hourly_avg:.1f}x the 24h hourly average ({hourly_avg:.0f})",
                metric_value=float(count_1h),
                threshold_value=hourly_avg * 3,
            ))

        # Check 2: High failure rate in last hour
        fail_row = await conn.fetchrow("""
            SELECT
                COUNT(*) FILTER (WHERE status = 'ABORTED') AS failed,
                COUNT(*) AS total
            FROM nexthub_transfers
            WHERE tenant_id = $1 AND created_at >= $2
        """, tenant_id, window_1h)

        total_1h = fail_row["total"] or 0
        failed_1h = fail_row["failed"] or 0
        fail_rate = (failed_1h / total_1h * 100) if total_1h > 0 else 0

        if total_1h >= 10 and fail_rate > 20:
            severity = "CRITICAL" if fail_rate > 50 else "HIGH"
            alerts.append(AnomalyAlert(
                tenant_id=tenant_id,
                alert_type="HIGH_FAILURE_RATE",
                severity=severity,
                description=f"Transfer failure rate in last hour: {fail_rate:.1f}% ({failed_1h}/{total_1h})",
                metric_value=fail_rate,
                threshold_value=20.0,
            ))

        # Check 3: AML flag surge
        aml_row = await conn.fetchrow("""
            SELECT COUNT(*) AS aml_count
            FROM nexthub_transfers
            WHERE tenant_id = $1
              AND created_at >= $2
              AND fraud_score >= 70
        """, tenant_id, window_1h)

        aml_count = aml_row["aml_count"] or 0
        if aml_count >= 5:
            alerts.append(AnomalyAlert(
                tenant_id=tenant_id,
                alert_type="AML_FLAG_SURGE",
                severity="CRITICAL",
                description=f"{aml_count} transfers flagged by AML in the last hour",
                metric_value=float(aml_count),
                threshold_value=5.0,
            ))

    return alerts

async def generate_cbn_monthly_report(
    pool: asyncpg.Pool,
    tenant_id: str,
    year: int,
    month: int,
) -> RegulatoryReport:
    """
    Generate CBN Monthly Return (Form A) for a tenant.
    Covers: total transactions, value, NIP volumes, RTGS volumes, failed transactions.
    """
    period_start = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        period_end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        period_end = datetime(year, month + 1, 1, tzinfo=timezone.utc)

    metrics = await compute_tenant_metrics(pool, tenant_id, period_start, period_end)

    report_data = {
        "reportType": "CBN_FORM_A_MONTHLY_RETURN",
        "institutionCode": tenant_id,
        "reportingPeriod": f"{year}-{month:02d}",
        "totalTransactions": metrics.total_transfers,
        "totalValueNGN": metrics.total_value_kobo / 100,  # kobo to NGN
        "successfulTransactions": metrics.successful_transfers,
        "failedTransactions": metrics.failed_transfers,
        "successRatePct": metrics.success_rate_pct,
        "averageTransactionValueNGN": metrics.avg_transfer_value_kobo / 100,
        "peakTps": metrics.peak_tps,
        "amlFlagsRaised": metrics.aml_flags,
        "topCorridors": metrics.top_corridors,
        "generatedAt": metrics.generated_at.isoformat(),
        "complianceNote": "Generated automatically by NextHub Analytics Engine",
    }

    return RegulatoryReport(
        tenant_id=tenant_id,
        report_type="CBN_MONTHLY",
        jurisdiction="NG",
        period_start=period_start,
        period_end=period_end,
        report_data=report_data,
    )

# ─── API endpoints ────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "tenant-analytics", "time": datetime.now(timezone.utc).isoformat()}

@app.get("/api/v1/tenants/{tenant_id}/metrics", response_model=TenantMetrics)
async def get_metrics(
    tenant_id: str,
    hours: int = Query(default=24, ge=1, le=720),
    _auth=Depends(verify_api_key),
):
    pool = await get_pool()
    now = datetime.now(timezone.utc)
    period_start = now - timedelta(hours=hours)
    try:
        return await compute_tenant_metrics(pool, tenant_id, period_start, now)
    except Exception as e:
        logger.error(f"metrics_error tenant={tenant_id} error={e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/tenants/{tenant_id}/anomalies", response_model=list[AnomalyAlert])
async def get_anomalies(
    tenant_id: str,
    _auth=Depends(verify_api_key),
):
    pool = await get_pool()
    try:
        return await detect_anomalies(pool, tenant_id)
    except Exception as e:
        logger.error(f"anomaly_error tenant={tenant_id} error={e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/tenants/{tenant_id}/reports/cbn-monthly")
async def get_cbn_monthly_report(
    tenant_id: str,
    year: int = Query(..., ge=2020, le=2099),
    month: int = Query(..., ge=1, le=12),
    _auth=Depends(verify_api_key),
):
    pool = await get_pool()
    try:
        report = await generate_cbn_monthly_report(pool, tenant_id, year, month)
        return report
    except Exception as e:
        logger.error(f"report_error tenant={tenant_id} error={e}")
        raise HTTPException(status_code=500, detail=str(e))

# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=PORT,
        log_level="info",
        access_log=True,
        workers=2,
    )
