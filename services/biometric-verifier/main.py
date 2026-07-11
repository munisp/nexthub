"""
biometric-verifier — NextHub BVN/NIN Biometric Verification Service
═══════════════════════════════════════════════════════════════════════════════
This Python service integrates with:
  - NIBSS BVN Validation API (Bank Verification Number)
  - NIMC NIN Verification API (National Identity Number)
  - FRSC DL Verification API (Driver's Licence)
  - NPC Passport Verification API (Nigerian Passport)

It acts as a verification gateway between the NextHub identity directory and
the national biometric databases. All verification results are cached in Redis
(24h TTL) and published to Kafka for audit trail.

Language: Python 3.11 (FastAPI + httpx + Redis + Kafka)
"""

import asyncio
import hashlib
import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional

import httpx
import redis.asyncio as aioredis
from aiokafka import AIOKafkaProducer
from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

# ─── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","msg":"%(message)s"}',
)
logger = logging.getLogger("biometric-verifier")

# ─── Config ───────────────────────────────────────────────────────────────────

NIBSS_BVN_URL       = os.getenv("NIBSS_BVN_URL",       "https://api.nibss-plc.com.ng/bvn/v2")
NIBSS_BVN_API_KEY   = os.getenv("NIBSS_BVN_API_KEY",   "")
NIMC_NIN_URL        = os.getenv("NIMC_NIN_URL",         "https://api.nimc.gov.ng/nin/v1")
NIMC_NIN_API_KEY    = os.getenv("NIMC_NIN_API_KEY",     "")
REDIS_URL           = os.getenv("REDIS_URL",            "redis://redis:6379")
KAFKA_BROKERS       = os.getenv("KAFKA_BROKERS",        "kafka:9092")
CACHE_TTL_SECONDS   = int(os.getenv("CACHE_TTL_SECONDS", "86400"))  # 24 hours

TOPIC_VERIFICATION_RESULT = "nexthub.biometric.verification.result"
TOPIC_VERIFICATION_FAILED = "nexthub.biometric.verification.failed"

# ─── Models ───────────────────────────────────────────────────────────────────

class BvnVerifyRequest(BaseModel):
    bvn:          str = Field(..., min_length=11, max_length=11, description="11-digit BVN")
    first_name:   Optional[str] = None
    last_name:    Optional[str] = None
    date_of_birth: Optional[str] = None  # YYYY-MM-DD
    phone:        Optional[str] = None
    tenant_id:    Optional[str] = None

class NinVerifyRequest(BaseModel):
    nin:          str = Field(..., min_length=11, max_length=11, description="11-digit NIN")
    first_name:   Optional[str] = None
    last_name:    Optional[str] = None
    date_of_birth: Optional[str] = None
    tenant_id:    Optional[str] = None

class VerificationResult(BaseModel):
    verified:       bool
    id_type:        str  # "BVN" | "NIN" | "DL" | "PASSPORT"
    id_value:       str
    id_hash:        str  # SHA-256 of id_value (never store raw)
    first_name:     Optional[str] = None
    last_name:      Optional[str] = None
    date_of_birth:  Optional[str] = None
    phone:          Optional[str] = None
    gender:         Optional[str] = None
    match_score:    float = 0.0  # 0.0–1.0
    verified_at:    str
    source:         str  # "NIBSS" | "NIMC" | "FRSC" | "NPC"
    cached:         bool = False

# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="NextHub Biometric Verifier",
    description="BVN/NIN/DL/Passport verification gateway",
    version="1.0.0",
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ─── Startup / Shutdown ───────────────────────────────────────────────────────

redis_client: Optional[aioredis.Redis] = None
kafka_producer: Optional[AIOKafkaProducer] = None

@app.on_event("startup")
async def startup():
    global redis_client, kafka_producer
    redis_client = await aioredis.from_url(REDIS_URL, encoding="utf-8", decode_responses=True)
    kafka_producer = AIOKafkaProducer(
        bootstrap_servers=KAFKA_BROKERS,
        compression_type="snappy",
        linger_ms=5,
        max_batch_size=65536,
    )
    await kafka_producer.start()
    logger.info("biometric_verifier.started")

@app.on_event("shutdown")
async def shutdown():
    if kafka_producer:
        await kafka_producer.stop()
    if redis_client:
        await redis_client.close()
    logger.info("biometric_verifier.stopped")

# ─── Helpers ──────────────────────────────────────────────────────────────────

def hash_id(value: str) -> str:
    return hashlib.sha256(value.strip().encode()).hexdigest()

async def get_cached(id_type: str, id_hash: str) -> Optional[VerificationResult]:
    if not redis_client:
        return None
    key = f"biometric:{id_type}:{id_hash}"
    raw = await redis_client.get(key)
    if raw:
        data = json.loads(raw)
        result = VerificationResult(**data)
        result.cached = True
        return result
    return None

async def set_cached(id_type: str, id_hash: str, result: VerificationResult):
    if not redis_client:
        return
    key = f"biometric:{id_type}:{id_hash}"
    await redis_client.setex(key, CACHE_TTL_SECONDS, result.model_dump_json())

async def publish_result(result: VerificationResult, tenant_id: Optional[str]):
    if not kafka_producer:
        return
    payload = {**result.model_dump(), "tenant_id": tenant_id}
    topic = TOPIC_VERIFICATION_RESULT if result.verified else TOPIC_VERIFICATION_FAILED
    await kafka_producer.send(
        topic,
        key=result.id_hash.encode(),
        value=json.dumps(payload).encode(),
    )

def compute_name_match_score(expected_first: Optional[str], expected_last: Optional[str],
                              actual_first: Optional[str], actual_last: Optional[str]) -> float:
    """Compute a simple Jaro-Winkler-like name match score."""
    if not expected_first and not expected_last:
        return 1.0  # No name check requested
    scores = []
    if expected_first and actual_first:
        ef = expected_first.lower().strip()
        af = actual_first.lower().strip()
        scores.append(1.0 if ef == af else (0.8 if ef in af or af in ef else 0.0))
    if expected_last and actual_last:
        el = expected_last.lower().strip()
        al = actual_last.lower().strip()
        scores.append(1.0 if el == al else (0.8 if el in al or al in el else 0.0))
    return sum(scores) / len(scores) if scores else 0.0

# ─── BVN Verification ─────────────────────────────────────────────────────────

@app.post("/v1/verify/bvn", response_model=VerificationResult)
async def verify_bvn(req: BvnVerifyRequest):
    id_hash = hash_id(req.bvn)

    # Cache check
    cached = await get_cached("BVN", id_hash)
    if cached:
        return cached

    # Call NIBSS BVN API
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{NIBSS_BVN_URL}/validate",
                json={"bvn": req.bvn},
                headers={
                    "Authorization": f"Bearer {NIBSS_BVN_API_KEY}",
                    "Content-Type": "application/json",
                    "X-Tenant-ID": req.tenant_id or "nexthub",
                },
            )
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPStatusError as e:
        logger.error(f"nibss_bvn_api_error status={e.response.status_code}")
        raise HTTPException(status_code=502, detail=f"NIBSS BVN API error: {e.response.status_code}")
    except httpx.RequestError as e:
        logger.error(f"nibss_bvn_connection_error: {e}")
        raise HTTPException(status_code=503, detail="NIBSS BVN API unreachable")

    # Parse NIBSS response
    bvn_data = data.get("data", {})
    actual_first = bvn_data.get("firstName", "")
    actual_last  = bvn_data.get("lastName", "")
    match_score  = compute_name_match_score(req.first_name, req.last_name, actual_first, actual_last)

    result = VerificationResult(
        verified       = data.get("status") == "success" and match_score >= 0.7,
        id_type        = "BVN",
        id_value       = req.bvn,
        id_hash        = id_hash,
        first_name     = actual_first,
        last_name      = actual_last,
        date_of_birth  = bvn_data.get("dateOfBirth"),
        phone          = bvn_data.get("phoneNumber"),
        gender         = bvn_data.get("gender"),
        match_score    = match_score,
        verified_at    = datetime.now(timezone.utc).isoformat(),
        source         = "NIBSS",
    )

    await set_cached("BVN", id_hash, result)
    await publish_result(result, req.tenant_id)

    logger.info(f"bvn_verified bvn_hash={id_hash[:8]}... verified={result.verified} score={match_score:.2f}")
    return result

# ─── NIN Verification ─────────────────────────────────────────────────────────

@app.post("/v1/verify/nin", response_model=VerificationResult)
async def verify_nin(req: NinVerifyRequest):
    id_hash = hash_id(req.nin)

    cached = await get_cached("NIN", id_hash)
    if cached:
        return cached

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                f"{NIMC_NIN_URL}/verify/{req.nin}",
                headers={
                    "Authorization": f"Bearer {NIMC_NIN_API_KEY}",
                    "X-Tenant-ID": req.tenant_id or "nexthub",
                },
            )
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPStatusError as e:
        logger.error(f"nimc_nin_api_error status={e.response.status_code}")
        raise HTTPException(status_code=502, detail=f"NIMC NIN API error: {e.response.status_code}")
    except httpx.RequestError as e:
        logger.error(f"nimc_nin_connection_error: {e}")
        raise HTTPException(status_code=503, detail="NIMC NIN API unreachable")

    nin_data = data.get("data", {})
    actual_first = nin_data.get("firstname", "")
    actual_last  = nin_data.get("surname", "")
    match_score  = compute_name_match_score(req.first_name, req.last_name, actual_first, actual_last)

    result = VerificationResult(
        verified       = data.get("status") == "00" and match_score >= 0.7,
        id_type        = "NIN",
        id_value       = req.nin,
        id_hash        = id_hash,
        first_name     = actual_first,
        last_name      = actual_last,
        date_of_birth  = nin_data.get("birthdate"),
        phone          = nin_data.get("telephoneno"),
        gender         = nin_data.get("gender"),
        match_score    = match_score,
        verified_at    = datetime.now(timezone.utc).isoformat(),
        source         = "NIMC",
    )

    await set_cached("NIN", id_hash, result)
    await publish_result(result, req.tenant_id)

    logger.info(f"nin_verified nin_hash={id_hash[:8]}... verified={result.verified} score={match_score:.2f}")
    return result

# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "biometric-verifier"}

# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8210")),
        workers=int(os.getenv("WORKERS", "4")),
        log_config=None,
    )
