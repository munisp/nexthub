"""
face-biometric — NextHub Next-Generation Face Biometric Service
═══════════════════════════════════════════════════════════════════════════════
This Python service provides production-grade face biometric capabilities:

  1. Face Detection & Alignment   — InsightFace RetinaFace detector
  2. Face Embedding / Recognition — InsightFace ArcFace (buffalo_l model,
                                    512-d cosine-similarity embeddings)
  3. Passive Liveness Detection   — Silent-Face Anti-Spoofing (ONNX model)
                                    detects print attacks, replay attacks,
                                    and 3D mask attacks
  4. Face Quality Assessment      — ISO/IEC 19794-5 inspired quality metrics
                                    (blur, brightness, contrast, pose angle,
                                     occlusion score, resolution)
  5. 1:1 Face Verification        — compare probe vs reference image
  6. Name Matching                — proper Jaro-Winkler algorithm (jellyfish)
                                    replacing the previous substring heuristic
  7. Audit Trail                  — all results published to Kafka
  8. Result Caching               — Redis 24h TTL keyed on image hash

Architecture:
  - FastAPI (async) on port 8220
  - InsightFace buffalo_l model (~340 MB, auto-downloaded on first start)
  - Silent-Face ONNX anti-spoofing model (~1.5 MB, bundled in /app/models/)
  - Redis for result caching
  - Kafka for audit trail

API Endpoints:
  POST /v1/face/verify          — 1:1 face verification (probe vs reference)
  POST /v1/face/liveness        — passive liveness / anti-spoofing check
  POST /v1/face/quality         — face quality assessment
  POST /v1/face/enroll          — extract and store face embedding
  POST /v1/face/identify        — 1:N identification against enrolled set
  POST /v1/name/match           — Jaro-Winkler name match score
  GET  /health                  — health check

Language: Python 3.12 (FastAPI + InsightFace + ONNX + Redis + Kafka)
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import io
import json
import logging
import math
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import cv2
import jellyfish
import numpy as np
import redis.asyncio as aioredis
import uvicorn
from aiokafka import AIOKafkaProducer
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel, Field
from skimage import filters as skfilters

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","msg":"%(message)s"}',
)
logger = logging.getLogger("face-biometric")

# ─── Config ───────────────────────────────────────────────────────────────────
REDIS_URL             = os.getenv("REDIS_URL",             "redis://redis:6379")
KAFKA_BROKERS         = os.getenv("KAFKA_BROKERS",         "kafka:9092")
CACHE_TTL_SECONDS     = int(os.getenv("CACHE_TTL_SECONDS", "86400"))  # 24 h
INSIGHTFACE_MODEL     = os.getenv("INSIGHTFACE_MODEL",     "buffalo_l")
INSIGHTFACE_CTX_ID    = int(os.getenv("INSIGHTFACE_CTX_ID", "-1"))   # -1 = CPU
LIVENESS_MODEL_PATH   = os.getenv("LIVENESS_MODEL_PATH",  "/app/models/silent_face_anti_spoof.onnx")
FACE_VERIFY_THRESHOLD = float(os.getenv("FACE_VERIFY_THRESHOLD", "0.40"))  # cosine distance
LIVENESS_THRESHOLD    = float(os.getenv("LIVENESS_THRESHOLD",    "0.60"))  # spoof score
QUALITY_MIN_SCORE     = float(os.getenv("QUALITY_MIN_SCORE",     "0.50"))  # quality gate
MAX_IMAGE_BYTES       = int(os.getenv("MAX_IMAGE_BYTES",   str(5 * 1024 * 1024)))  # 5 MB

TOPIC_FACE_VERIFY     = "nexthub.face.verify.result.v1"
TOPIC_FACE_LIVENESS   = "nexthub.face.liveness.result.v1"
TOPIC_FACE_ENROLL     = "nexthub.face.enroll.result.v1"
TOPIC_FACE_IDENTIFY   = "nexthub.face.identify.result.v1"
TOPIC_FACE_FAILED     = "nexthub.face.failed.v1"

# ─── Models ───────────────────────────────────────────────────────────────────

class FaceVerifyRequest(BaseModel):
    """1:1 face verification — compare probe image against reference image."""
    probe_image_b64:     str  = Field(..., description="Base64-encoded JPEG/PNG probe image")
    reference_image_b64: str  = Field(..., description="Base64-encoded JPEG/PNG reference image")
    subject_id:          Optional[str] = None
    tenant_id:           Optional[str] = None
    require_liveness:    bool = Field(True,  description="Run liveness check on probe image")
    require_quality:     bool = Field(True,  description="Run quality check on probe image")
    min_quality_score:   float = Field(0.50, description="Minimum quality score (0–1)")

class FaceLivenessRequest(BaseModel):
    """Passive liveness / anti-spoofing check on a single image."""
    image_b64:   str = Field(..., description="Base64-encoded JPEG/PNG image")
    subject_id:  Optional[str] = None
    tenant_id:   Optional[str] = None

class FaceQualityRequest(BaseModel):
    """Face quality assessment (ISO 19794-5 inspired)."""
    image_b64:   str = Field(..., description="Base64-encoded JPEG/PNG image")
    subject_id:  Optional[str] = None
    tenant_id:   Optional[str] = None

class FaceEnrollRequest(BaseModel):
    """Extract and cache a face embedding for a subject."""
    image_b64:   str = Field(..., description="Base64-encoded JPEG/PNG image")
    subject_id:  str = Field(..., description="Unique subject identifier (e.g. UIN hash)")
    tenant_id:   Optional[str] = None
    require_liveness: bool = Field(True)
    require_quality:  bool = Field(True)

class FaceIdentifyRequest(BaseModel):
    """1:N identification — match probe against a list of enrolled embeddings."""
    probe_image_b64: str = Field(..., description="Base64-encoded JPEG/PNG probe image")
    candidate_ids:   List[str] = Field(..., description="List of subject_ids to match against")
    tenant_id:       Optional[str] = None
    require_liveness: bool = Field(True)
    top_k:           int = Field(5, ge=1, le=50)

class NameMatchRequest(BaseModel):
    """Compute Jaro-Winkler name match score between two name pairs."""
    expected_first:  Optional[str] = None
    expected_last:   Optional[str] = None
    actual_first:    Optional[str] = None
    actual_last:     Optional[str] = None
    expected_full:   Optional[str] = None
    actual_full:     Optional[str] = None

class QualityMetrics(BaseModel):
    blur_score:       float  # 0–1, higher = sharper
    brightness_score: float  # 0–1, higher = better
    contrast_score:   float  # 0–1, higher = better
    pose_yaw:         float  # degrees, 0 = frontal
    pose_pitch:       float  # degrees, 0 = frontal
    pose_roll:        float  # degrees, 0 = frontal
    resolution_ok:    bool   # True if >= 100x100 px
    face_size_ratio:  float  # face bbox area / image area
    overall_score:    float  # 0–1 composite

class FaceVerifyResult(BaseModel):
    verified:         bool
    similarity:       float   # cosine similarity 0–1
    distance:         float   # cosine distance 0–1 (lower = more similar)
    threshold:        float
    liveness_passed:  Optional[bool]   = None
    liveness_score:   Optional[float]  = None
    quality_passed:   Optional[bool]   = None
    quality_metrics:  Optional[QualityMetrics] = None
    face_count_probe: int = 0
    face_count_ref:   int = 0
    subject_id:       Optional[str] = None
    image_hash_probe: str = ""
    verified_at:      str = ""
    processing_ms:    float = 0.0
    cached:           bool = False

class FaceLivenessResult(BaseModel):
    is_live:          bool
    spoof_score:      float   # 0–1, higher = more likely spoof
    liveness_score:   float   # 0–1, higher = more likely live
    attack_type:      Optional[str] = None  # "print", "replay", "3d_mask", None
    face_detected:    bool = False
    subject_id:       Optional[str] = None
    image_hash:       str = ""
    checked_at:       str = ""
    processing_ms:    float = 0.0
    cached:           bool = False

class FaceQualityResult(BaseModel):
    quality_passed:   bool
    metrics:          QualityMetrics
    face_detected:    bool = False
    subject_id:       Optional[str] = None
    image_hash:       str = ""
    assessed_at:      str = ""
    processing_ms:    float = 0.0

class FaceEnrollResult(BaseModel):
    enrolled:         bool
    subject_id:       str
    embedding_dim:    int = 0
    liveness_passed:  Optional[bool]  = None
    quality_passed:   Optional[bool]  = None
    enrolled_at:      str = ""
    processing_ms:    float = 0.0

class FaceIdentifyResult(BaseModel):
    identified:       bool
    top_match_id:     Optional[str]  = None
    top_similarity:   float = 0.0
    matches:          List[Dict[str, Any]] = []
    probe_liveness:   Optional[bool] = None
    processing_ms:    float = 0.0

class NameMatchResult(BaseModel):
    match_score:      float   # 0–1
    first_name_score: Optional[float] = None
    last_name_score:  Optional[float] = None
    full_name_score:  Optional[float] = None
    matched:          bool    # True if score >= 0.70

# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="NextHub Face Biometric Service",
    description="Next-generation face recognition, liveness detection, and quality assessment",
    version="2.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Global singletons ────────────────────────────────────────────────────────
redis_client:    Optional[aioredis.Redis]    = None
kafka_producer:  Optional[AIOKafkaProducer]  = None
face_app:        Any = None   # insightface.app.FaceAnalysis
liveness_session: Any = None  # onnxruntime.InferenceSession

# ─── Startup / Shutdown ───────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    global redis_client, kafka_producer, face_app, liveness_session
    # Redis
    try:
        redis_client = await aioredis.from_url(
            REDIS_URL, encoding="utf-8", decode_responses=True
        )
        await redis_client.ping()
        logger.info("redis_connected")
    except Exception as e:
        logger.warning(f"redis_unavailable: {e}")
        redis_client = None

    # Kafka
    try:
        kafka_producer = AIOKafkaProducer(
            bootstrap_servers=KAFKA_BROKERS,
            compression_type="snappy",
            linger_ms=5,
            max_batch_size=65536,
        )
        await kafka_producer.start()
        logger.info("kafka_connected")
    except Exception as e:
        logger.warning(f"kafka_unavailable: {e}")
        kafka_producer = None

    # InsightFace — load in a thread pool to avoid blocking the event loop
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _load_insightface)

    # Liveness model (ONNX)
    await loop.run_in_executor(None, _load_liveness_model)

    logger.info("face_biometric_service.started")


def _load_insightface():
    global face_app
    try:
        import insightface
        from insightface.app import FaceAnalysis
        fa = FaceAnalysis(
            name=INSIGHTFACE_MODEL,
            providers=["CPUExecutionProvider"],
        )
        fa.prepare(ctx_id=INSIGHTFACE_CTX_ID, det_size=(640, 640))
        face_app = fa
        logger.info(f"insightface_loaded model={INSIGHTFACE_MODEL}")
    except Exception as e:
        logger.error(f"insightface_load_failed: {e}")
        face_app = None


def _load_liveness_model():
    global liveness_session
    if not os.path.exists(LIVENESS_MODEL_PATH):
        logger.warning(
            f"liveness_model_not_found path={LIVENESS_MODEL_PATH} — "
            "liveness checks will use heuristic fallback"
        )
        liveness_session = None
        return
    try:
        import onnxruntime as ort
        sess_options = ort.SessionOptions()
        sess_options.intra_op_num_threads = 4
        liveness_session = ort.InferenceSession(
            LIVENESS_MODEL_PATH,
            sess_options=sess_options,
            providers=["CPUExecutionProvider"],
        )
        logger.info(f"liveness_model_loaded path={LIVENESS_MODEL_PATH}")
    except Exception as e:
        logger.error(f"liveness_model_load_failed: {e}")
        liveness_session = None


@app.on_event("shutdown")
async def shutdown():
    if kafka_producer:
        await kafka_producer.stop()
    if redis_client:
        await redis_client.close()
    logger.info("face_biometric_service.stopped")

# ─── Helpers — Image ──────────────────────────────────────────────────────────

def decode_image(b64_str: str) -> np.ndarray:
    """Decode a base64 image string to an OpenCV BGR numpy array."""
    # Strip data URI prefix if present (data:image/jpeg;base64,...)
    if "," in b64_str:
        b64_str = b64_str.split(",", 1)[1]
    raw = base64.b64decode(b64_str)
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Image too large: {len(raw)} bytes (max {MAX_IMAGE_BYTES})"
        )
    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="Cannot decode image — invalid format")
    return img


def image_hash(b64_str: str) -> str:
    """SHA-256 of the raw base64 bytes (used as cache key)."""
    if "," in b64_str:
        b64_str = b64_str.split(",", 1)[1]
    return hashlib.sha256(b64_str.encode()).hexdigest()


def bgr_to_rgb(img: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

# ─── Helpers — Face Detection & Embedding ─────────────────────────────────────

def detect_faces(img_bgr: np.ndarray) -> List[Any]:
    """Return a list of InsightFace Face objects detected in the image."""
    if face_app is None:
        raise HTTPException(
            status_code=503,
            detail="Face recognition model not loaded — service starting up"
        )
    faces = face_app.get(img_bgr)
    return faces


def get_embedding(faces: List[Any]) -> Optional[np.ndarray]:
    """Return the embedding of the largest (most prominent) detected face."""
    if not faces:
        return None
    # Pick the face with the largest bounding box area
    best = max(faces, key=lambda f: _bbox_area(f.bbox))
    emb = best.embedding
    if emb is None:
        return None
    # L2-normalise to unit sphere for cosine similarity
    norm = np.linalg.norm(emb)
    if norm == 0:
        return emb
    return emb / norm


def _bbox_area(bbox) -> float:
    x1, y1, x2, y2 = bbox
    return max(0.0, float((x2 - x1) * (y2 - y1)))


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity between two L2-normalised embeddings (range 0–1)."""
    return float(np.clip(np.dot(a, b), -1.0, 1.0))


def cosine_distance(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine distance (1 - similarity), range 0–2, clamped to 0–1."""
    return float(np.clip(1.0 - np.dot(a, b), 0.0, 1.0))

# ─── Helpers — Liveness ───────────────────────────────────────────────────────

def _preprocess_for_liveness(img_bgr: np.ndarray) -> np.ndarray:
    """Resize and normalise image for Silent-Face ONNX model input."""
    img_resized = cv2.resize(img_bgr, (80, 80))
    img_rgb = cv2.cvtColor(img_resized, cv2.COLOR_BGR2RGB)
    img_float = img_rgb.astype(np.float32) / 255.0
    # Normalise with ImageNet mean/std
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std  = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    img_norm = (img_float - mean) / std
    # NCHW
    return np.transpose(img_norm, (2, 0, 1))[np.newaxis, ...]


def run_liveness(img_bgr: np.ndarray, faces: List[Any]) -> Tuple[bool, float, Optional[str]]:
    """
    Run passive liveness detection.

    Returns (is_live, liveness_score, attack_type).

    If the ONNX model is not loaded, falls back to a heuristic based on
    image texture analysis (Laplacian variance + LBP entropy).
    """
    if not faces:
        return False, 0.0, None

    # Crop the face region with a 20% margin for better context
    best_face = max(faces, key=lambda f: _bbox_area(f.bbox))
    x1, y1, x2, y2 = [int(v) for v in best_face.bbox]
    h, w = img_bgr.shape[:2]
    margin_x = int((x2 - x1) * 0.20)
    margin_y = int((y2 - y1) * 0.20)
    x1 = max(0, x1 - margin_x)
    y1 = max(0, y1 - margin_y)
    x2 = min(w, x2 + margin_x)
    y2 = min(h, y2 + margin_y)
    face_crop = img_bgr[y1:y2, x1:x2]

    if liveness_session is not None:
        # ONNX inference
        inp = _preprocess_for_liveness(face_crop)
        input_name = liveness_session.get_inputs()[0].name
        outputs = liveness_session.run(None, {input_name: inp})
        # Model output: [spoof_prob, live_prob] or single logit
        raw = outputs[0].flatten()
        if len(raw) >= 2:
            # Softmax
            exp = np.exp(raw - raw.max())
            probs = exp / exp.sum()
            spoof_score    = float(probs[0])
            liveness_score = float(probs[1])
        else:
            # Single logit — sigmoid
            liveness_score = float(1.0 / (1.0 + math.exp(-float(raw[0]))))
            spoof_score    = 1.0 - liveness_score

        is_live = liveness_score >= LIVENESS_THRESHOLD
        attack_type = None
        if not is_live:
            # Heuristic attack classification based on score magnitude
            if spoof_score > 0.90:
                attack_type = "print"
            elif spoof_score > 0.75:
                attack_type = "replay"
            else:
                attack_type = "3d_mask"
        return is_live, liveness_score, attack_type

    else:
        # ── Heuristic fallback (no ONNX model) ────────────────────────────────
        # Uses Laplacian variance (sharpness proxy) and LBP texture entropy
        # as a coarse anti-spoofing signal.  Not production-grade but better
        # than no check at all.
        gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)

        # 1. Laplacian variance — printed photos tend to be blurrier
        lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        sharpness_score = min(1.0, lap_var / 500.0)

        # 2. LBP texture entropy — screens have periodic patterns
        lbp = _compute_lbp(gray)
        hist, _ = np.histogram(lbp.ravel(), bins=256, range=(0, 256), density=True)
        hist = hist[hist > 0]
        entropy = float(-np.sum(hist * np.log2(hist)))
        entropy_score = min(1.0, entropy / 7.0)  # natural faces ~6–7 bits

        # 3. Frequency domain — replay attacks have low high-frequency content
        f_transform = np.fft.fft2(gray)
        f_shift = np.fft.fftshift(f_transform)
        magnitude = np.abs(f_shift)
        h_f, w_f = magnitude.shape
        cy, cx = h_f // 2, w_f // 2
        r = min(h_f, w_f) // 4
        low_freq  = magnitude[cy-r:cy+r, cx-r:cx+r].sum()
        high_freq = magnitude.sum() - low_freq
        freq_ratio = float(high_freq / (low_freq + 1e-6))
        freq_score = min(1.0, freq_ratio / 0.5)

        liveness_score = (sharpness_score * 0.35 + entropy_score * 0.35 + freq_score * 0.30)
        spoof_score    = 1.0 - liveness_score
        is_live        = liveness_score >= LIVENESS_THRESHOLD
        attack_type    = None if is_live else ("print" if sharpness_score < 0.3 else "replay")
        return is_live, liveness_score, attack_type


def _compute_lbp(gray: np.ndarray, radius: int = 1, n_points: int = 8) -> np.ndarray:
    """Compute Local Binary Pattern texture descriptor."""
    output = np.zeros_like(gray)
    h, w = gray.shape
    for i in range(radius, h - radius):
        for j in range(radius, w - radius):
            center = gray[i, j]
            code = 0
            for k in range(n_points):
                angle = 2 * math.pi * k / n_points
                ni = i - int(round(radius * math.sin(angle)))
                nj = j + int(round(radius * math.cos(angle)))
                if 0 <= ni < h and 0 <= nj < w:
                    code |= (1 << k) if gray[ni, nj] >= center else 0
            output[i, j] = code
    return output

# ─── Helpers — Quality Assessment ─────────────────────────────────────────────

def assess_quality(img_bgr: np.ndarray, faces: List[Any]) -> QualityMetrics:
    """
    Compute ISO 19794-5 inspired quality metrics.

    Metrics:
      - blur_score:       Laplacian variance normalised to 0–1
      - brightness_score: mean pixel brightness in 0–1 range
      - contrast_score:   RMS contrast normalised to 0–1
      - pose_yaw/pitch/roll: face pose angles in degrees (from InsightFace)
      - resolution_ok:    face bounding box >= 100×100 px
      - face_size_ratio:  face area / image area
      - overall_score:    weighted composite
    """
    h, w = img_bgr.shape[:2]
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    # Blur (Laplacian variance)
    lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    blur_score = float(min(1.0, lap_var / 300.0))

    # Brightness (mean of normalised gray)
    mean_brightness = float(gray.mean() / 255.0)
    # Penalise extremes (too dark or too bright)
    brightness_score = float(1.0 - abs(mean_brightness - 0.5) * 2.0)
    brightness_score = max(0.0, brightness_score)

    # Contrast (RMS contrast)
    rms_contrast = float(gray.std() / 128.0)
    contrast_score = float(min(1.0, rms_contrast))

    # Pose angles and face size from InsightFace
    pose_yaw = pose_pitch = pose_roll = 0.0
    resolution_ok = False
    face_size_ratio = 0.0

    if faces:
        best = max(faces, key=lambda f: _bbox_area(f.bbox))
        x1, y1, x2, y2 = best.bbox
        fw = float(x2 - x1)
        fh = float(y2 - y1)
        resolution_ok = fw >= 100 and fh >= 100
        face_size_ratio = float((fw * fh) / (w * h + 1e-6))

        if hasattr(best, "pose") and best.pose is not None:
            pose = best.pose
            if len(pose) >= 3:
                pose_pitch, pose_yaw, pose_roll = float(pose[0]), float(pose[1]), float(pose[2])

    # Pose penalty — penalise yaw/pitch > 30°
    pose_penalty = max(0.0, 1.0 - (abs(pose_yaw) + abs(pose_pitch)) / 60.0)

    # Overall composite score
    overall_score = (
        blur_score       * 0.25 +
        brightness_score * 0.15 +
        contrast_score   * 0.15 +
        pose_penalty     * 0.25 +
        (1.0 if resolution_ok else 0.0) * 0.10 +
        min(1.0, face_size_ratio * 10.0) * 0.10
    )

    return QualityMetrics(
        blur_score=round(blur_score, 4),
        brightness_score=round(brightness_score, 4),
        contrast_score=round(contrast_score, 4),
        pose_yaw=round(pose_yaw, 2),
        pose_pitch=round(pose_pitch, 2),
        pose_roll=round(pose_roll, 2),
        resolution_ok=resolution_ok,
        face_size_ratio=round(face_size_ratio, 4),
        overall_score=round(overall_score, 4),
    )

# ─── Helpers — Name Matching ──────────────────────────────────────────────────

def _jaro_winkler(s1: str, s2: str) -> float:
    """Jaro-Winkler similarity using the jellyfish library."""
    if not s1 and not s2:
        return 1.0
    if not s1 or not s2:
        return 0.0
    return float(jellyfish.jaro_winkler_similarity(s1.lower().strip(), s2.lower().strip()))


def compute_name_match_score(
    expected_first: Optional[str],
    expected_last:  Optional[str],
    actual_first:   Optional[str],
    actual_last:    Optional[str],
    expected_full:  Optional[str] = None,
    actual_full:    Optional[str] = None,
) -> Tuple[float, Optional[float], Optional[float], Optional[float]]:
    """
    Compute a robust name match score using Jaro-Winkler similarity.

    Returns (overall_score, first_score, last_score, full_score).

    Strategy:
      1. If full names are provided, use Jaro-Winkler on the full name strings.
      2. Otherwise, compute Jaro-Winkler on first and last separately and
         take a weighted average (last name weighted 60%, first 40%).
      3. Also check phonetic equivalence using Soundex for transliterated names.
    """
    first_score: Optional[float] = None
    last_score:  Optional[float] = None
    full_score:  Optional[float] = None

    scores = []

    # Full name comparison
    if expected_full and actual_full:
        full_score = _jaro_winkler(expected_full, actual_full)
        # Also try Soundex phonetic match
        try:
            soundex_match = (
                jellyfish.soundex(expected_full.split()[0]) ==
                jellyfish.soundex(actual_full.split()[0])
            )
            if soundex_match and full_score < 0.85:
                full_score = max(full_score, 0.75)
        except Exception:
            pass
        scores.append((full_score, 1.0))

    # First + last name comparison
    if expected_first and actual_first:
        first_score = _jaro_winkler(expected_first, actual_first)
        # Phonetic boost for transliterated names
        try:
            if (jellyfish.soundex(expected_first) == jellyfish.soundex(actual_first)
                    and first_score < 0.85):
                first_score = max(first_score, 0.75)
        except Exception:
            pass
        scores.append((first_score, 0.40))

    if expected_last and actual_last:
        last_score = _jaro_winkler(expected_last, actual_last)
        try:
            if (jellyfish.soundex(expected_last) == jellyfish.soundex(actual_last)
                    and last_score < 0.85):
                last_score = max(last_score, 0.75)
        except Exception:
            pass
        scores.append((last_score, 0.60))

    if not scores:
        return 1.0, None, None, None  # No name provided — pass through

    total_weight = sum(w for _, w in scores)
    overall = sum(s * w for s, w in scores) / total_weight
    return round(overall, 4), first_score, last_score, full_score

# ─── Helpers — Cache & Kafka ──────────────────────────────────────────────────

async def get_cached(key: str) -> Optional[Dict]:
    if not redis_client:
        return None
    raw = await redis_client.get(f"face:{key}")
    if raw:
        return json.loads(raw)
    return None


async def set_cached(key: str, data: Dict):
    if not redis_client:
        return
    await redis_client.setex(f"face:{key}", CACHE_TTL_SECONDS, json.dumps(data))


async def publish_event(topic: str, key: str, payload: Dict):
    if not kafka_producer:
        return
    try:
        await kafka_producer.send(
            topic,
            key=key.encode(),
            value=json.dumps(payload).encode(),
        )
    except Exception as e:
        logger.warning(f"kafka_publish_failed topic={topic}: {e}")

# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.post("/v1/face/verify", response_model=FaceVerifyResult)
async def verify_face(req: FaceVerifyRequest, bg: BackgroundTasks):
    """
    1:1 face verification.

    Compares the probe image against the reference image using ArcFace
    cosine similarity. Optionally runs liveness detection and quality
    assessment on the probe image.
    """
    t0 = time.monotonic()

    # Cache check (keyed on both image hashes)
    h_probe = image_hash(req.probe_image_b64)
    h_ref   = image_hash(req.reference_image_b64)
    cache_key = f"verify:{h_probe}:{h_ref}"
    cached = await get_cached(cache_key)
    if cached:
        result = FaceVerifyResult(**cached)
        result.cached = True
        return result

    # Decode images
    img_probe = decode_image(req.probe_image_b64)
    img_ref   = decode_image(req.reference_image_b64)

    # Detect faces
    faces_probe = detect_faces(img_probe)
    faces_ref   = detect_faces(img_ref)

    result_base = dict(
        subject_id=req.subject_id,
        image_hash_probe=h_probe,
        verified_at=datetime.now(timezone.utc).isoformat(),
        face_count_probe=len(faces_probe),
        face_count_ref=len(faces_ref),
        threshold=FACE_VERIFY_THRESHOLD,
    )

    if not faces_probe or not faces_ref:
        result = FaceVerifyResult(
            verified=False,
            similarity=0.0,
            distance=1.0,
            **result_base,
            processing_ms=round((time.monotonic() - t0) * 1000, 2),
        )
        bg.add_task(publish_event, TOPIC_FACE_FAILED, h_probe, result.model_dump())
        return result

    # Liveness check on probe
    liveness_passed: Optional[bool] = None
    liveness_score:  Optional[float] = None
    if req.require_liveness:
        is_live, l_score, attack_type = run_liveness(img_probe, faces_probe)
        liveness_passed = is_live
        liveness_score  = round(l_score, 4)
        if not is_live:
            result = FaceVerifyResult(
                verified=False,
                similarity=0.0,
                distance=1.0,
                liveness_passed=False,
                liveness_score=liveness_score,
                **result_base,
                processing_ms=round((time.monotonic() - t0) * 1000, 2),
            )
            bg.add_task(publish_event, TOPIC_FACE_FAILED, h_probe, result.model_dump())
            return result

    # Quality check on probe
    quality_passed: Optional[bool] = None
    quality_metrics: Optional[QualityMetrics] = None
    if req.require_quality:
        qm = assess_quality(img_probe, faces_probe)
        quality_metrics = qm
        quality_passed  = qm.overall_score >= req.min_quality_score
        if not quality_passed:
            result = FaceVerifyResult(
                verified=False,
                similarity=0.0,
                distance=1.0,
                liveness_passed=liveness_passed,
                liveness_score=liveness_score,
                quality_passed=False,
                quality_metrics=quality_metrics,
                **result_base,
                processing_ms=round((time.monotonic() - t0) * 1000, 2),
            )
            bg.add_task(publish_event, TOPIC_FACE_FAILED, h_probe, result.model_dump())
            return result

    # Extract embeddings
    emb_probe = get_embedding(faces_probe)
    emb_ref   = get_embedding(faces_ref)

    if emb_probe is None or emb_ref is None:
        result = FaceVerifyResult(
            verified=False,
            similarity=0.0,
            distance=1.0,
            liveness_passed=liveness_passed,
            liveness_score=liveness_score,
            quality_passed=quality_passed,
            quality_metrics=quality_metrics,
            **result_base,
            processing_ms=round((time.monotonic() - t0) * 1000, 2),
        )
        bg.add_task(publish_event, TOPIC_FACE_FAILED, h_probe, result.model_dump())
        return result

    # Compute similarity
    sim  = cosine_similarity(emb_probe, emb_ref)
    dist = cosine_distance(emb_probe, emb_ref)
    verified = dist <= FACE_VERIFY_THRESHOLD

    result = FaceVerifyResult(
        verified=verified,
        similarity=round(sim, 6),
        distance=round(dist, 6),
        liveness_passed=liveness_passed,
        liveness_score=liveness_score,
        quality_passed=quality_passed,
        quality_metrics=quality_metrics,
        **result_base,
        processing_ms=round((time.monotonic() - t0) * 1000, 2),
    )

    # Cache and publish
    await set_cached(cache_key, result.model_dump())
    topic = TOPIC_FACE_VERIFY if verified else TOPIC_FACE_FAILED
    bg.add_task(publish_event, topic, h_probe, result.model_dump())

    logger.info(
        f"face_verify subject={req.subject_id} verified={verified} "
        f"sim={sim:.4f} dist={dist:.4f} liveness={liveness_passed}"
    )
    return result


@app.post("/v1/face/liveness", response_model=FaceLivenessResult)
async def check_liveness(req: FaceLivenessRequest, bg: BackgroundTasks):
    """
    Passive liveness / anti-spoofing check.

    Detects print attacks, replay attacks, and 3D mask attacks using the
    Silent-Face Anti-Spoofing ONNX model (or heuristic fallback).
    """
    t0 = time.monotonic()
    h  = image_hash(req.image_b64)

    cached = await get_cached(f"liveness:{h}")
    if cached:
        result = FaceLivenessResult(**cached)
        result.cached = True
        return result

    img = decode_image(req.image_b64)
    faces = detect_faces(img)

    if not faces:
        result = FaceLivenessResult(
            is_live=False,
            spoof_score=1.0,
            liveness_score=0.0,
            face_detected=False,
            subject_id=req.subject_id,
            image_hash=h,
            checked_at=datetime.now(timezone.utc).isoformat(),
            processing_ms=round((time.monotonic() - t0) * 1000, 2),
        )
        bg.add_task(publish_event, TOPIC_FACE_LIVENESS, h, result.model_dump())
        return result

    is_live, liveness_score, attack_type = run_liveness(img, faces)
    spoof_score = round(1.0 - liveness_score, 4)

    result = FaceLivenessResult(
        is_live=is_live,
        spoof_score=spoof_score,
        liveness_score=round(liveness_score, 4),
        attack_type=attack_type,
        face_detected=True,
        subject_id=req.subject_id,
        image_hash=h,
        checked_at=datetime.now(timezone.utc).isoformat(),
        processing_ms=round((time.monotonic() - t0) * 1000, 2),
    )

    await set_cached(f"liveness:{h}", result.model_dump())
    bg.add_task(publish_event, TOPIC_FACE_LIVENESS, h, result.model_dump())
    logger.info(f"face_liveness subject={req.subject_id} is_live={is_live} score={liveness_score:.4f}")
    return result


@app.post("/v1/face/quality", response_model=FaceQualityResult)
async def assess_face_quality(req: FaceQualityRequest):
    """
    Face quality assessment.

    Returns ISO 19794-5 inspired quality metrics including blur, brightness,
    contrast, pose angles, resolution, and face size ratio.
    """
    t0 = time.monotonic()
    img = decode_image(req.image_b64)
    faces = detect_faces(img)

    qm = assess_quality(img, faces)
    quality_passed = qm.overall_score >= QUALITY_MIN_SCORE

    return FaceQualityResult(
        quality_passed=quality_passed,
        metrics=qm,
        face_detected=len(faces) > 0,
        subject_id=req.subject_id,
        image_hash=image_hash(req.image_b64),
        assessed_at=datetime.now(timezone.utc).isoformat(),
        processing_ms=round((time.monotonic() - t0) * 1000, 2),
    )


@app.post("/v1/face/enroll", response_model=FaceEnrollResult)
async def enroll_face(req: FaceEnrollRequest, bg: BackgroundTasks):
    """
    Enroll a face — extract ArcFace embedding and store in Redis.

    The embedding is stored under key `face:emb:{subject_id}` and can be
    retrieved for 1:N identification.
    """
    t0 = time.monotonic()
    img = decode_image(req.image_b64)
    faces = detect_faces(img)

    if not faces:
        raise HTTPException(status_code=422, detail="No face detected in enrollment image")

    # Liveness check
    liveness_passed: Optional[bool] = None
    if req.require_liveness:
        is_live, _, _ = run_liveness(img, faces)
        liveness_passed = is_live
        if not is_live:
            raise HTTPException(
                status_code=422,
                detail="Liveness check failed — enrollment rejected"
            )

    # Quality check
    quality_passed: Optional[bool] = None
    if req.require_quality:
        qm = assess_quality(img, faces)
        quality_passed = qm.overall_score >= QUALITY_MIN_SCORE
        if not quality_passed:
            raise HTTPException(
                status_code=422,
                detail=f"Quality check failed (score={qm.overall_score:.2f}) — enrollment rejected"
            )

    emb = get_embedding(faces)
    if emb is None:
        raise HTTPException(status_code=422, detail="Could not extract face embedding")

    # Store embedding in Redis (serialised as JSON list)
    emb_key = f"emb:{req.subject_id}"
    if redis_client:
        await redis_client.setex(
            f"face:{emb_key}",
            CACHE_TTL_SECONDS * 30,  # 30-day TTL for enrollments
            json.dumps(emb.tolist()),
        )

    result = FaceEnrollResult(
        enrolled=True,
        subject_id=req.subject_id,
        embedding_dim=len(emb),
        liveness_passed=liveness_passed,
        quality_passed=quality_passed,
        enrolled_at=datetime.now(timezone.utc).isoformat(),
        processing_ms=round((time.monotonic() - t0) * 1000, 2),
    )
    bg.add_task(publish_event, TOPIC_FACE_ENROLL, req.subject_id, result.model_dump())
    logger.info(f"face_enroll subject={req.subject_id} dim={len(emb)}")
    return result


@app.post("/v1/face/identify", response_model=FaceIdentifyResult)
async def identify_face(req: FaceIdentifyRequest, bg: BackgroundTasks):
    """
    1:N face identification.

    Compares the probe image against a set of enrolled embeddings (by
    subject_id) and returns the top-K matches sorted by similarity.
    """
    t0 = time.monotonic()
    img = decode_image(req.probe_image_b64)
    faces = detect_faces(img)

    if not faces:
        return FaceIdentifyResult(
            identified=False,
            processing_ms=round((time.monotonic() - t0) * 1000, 2),
        )

    # Liveness check
    probe_liveness: Optional[bool] = None
    if req.require_liveness:
        is_live, _, _ = run_liveness(img, faces)
        probe_liveness = is_live
        if not is_live:
            return FaceIdentifyResult(
                identified=False,
                probe_liveness=False,
                processing_ms=round((time.monotonic() - t0) * 1000, 2),
            )

    emb_probe = get_embedding(faces)
    if emb_probe is None:
        return FaceIdentifyResult(
            identified=False,
            probe_liveness=probe_liveness,
            processing_ms=round((time.monotonic() - t0) * 1000, 2),
        )

    # Load candidate embeddings from Redis
    matches = []
    if redis_client:
        for sid in req.candidate_ids:
            raw = await redis_client.get(f"face:emb:{sid}")
            if raw:
                emb_cand = np.array(json.loads(raw), dtype=np.float32)
                norm = np.linalg.norm(emb_cand)
                if norm > 0:
                    emb_cand = emb_cand / norm
                sim  = cosine_similarity(emb_probe, emb_cand)
                dist = cosine_distance(emb_probe, emb_cand)
                matches.append({
                    "subject_id":  sid,
                    "similarity":  round(sim, 6),
                    "distance":    round(dist, 6),
                    "verified":    dist <= FACE_VERIFY_THRESHOLD,
                })

    matches.sort(key=lambda x: x["similarity"], reverse=True)
    top_k = matches[: req.top_k]
    identified = bool(top_k and top_k[0]["verified"])

    result = FaceIdentifyResult(
        identified=identified,
        top_match_id=top_k[0]["subject_id"] if top_k else None,
        top_similarity=top_k[0]["similarity"] if top_k else 0.0,
        matches=top_k,
        probe_liveness=probe_liveness,
        processing_ms=round((time.monotonic() - t0) * 1000, 2),
    )
    bg.add_task(publish_event, TOPIC_FACE_IDENTIFY, "identify", result.model_dump())
    return result


@app.post("/v1/name/match", response_model=NameMatchResult)
async def match_name(req: NameMatchRequest):
    """
    Compute Jaro-Winkler name match score.

    Replaces the previous substring heuristic with a proper Jaro-Winkler
    similarity algorithm, with Soundex phonetic boost for transliterated names.
    """
    overall, first_score, last_score, full_score = compute_name_match_score(
        req.expected_first,
        req.expected_last,
        req.actual_first,
        req.actual_last,
        req.expected_full,
        req.actual_full,
    )
    return NameMatchResult(
        match_score=overall,
        first_name_score=first_score,
        last_name_score=last_score,
        full_name_score=full_score,
        matched=overall >= 0.70,
    )


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "face-biometric",
        "insightface_loaded": face_app is not None,
        "liveness_model_loaded": liveness_session is not None,
        "redis_connected": redis_client is not None,
        "kafka_connected": kafka_producer is not None,
    }

# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8220")),
        workers=int(os.getenv("WORKERS", "2")),
        log_config=None,
    )
