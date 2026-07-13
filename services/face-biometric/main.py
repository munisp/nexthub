"""
face-biometric v3 — NextHub SOTA Face Biometric Service
========================================================
Languages: Python (AI/ML inference), integrates with Rust (bias-audit),
           Go (API gateway), TypeScript (tRPC/schema)

SOTA Enhancements:
  1.  ArcFace R100 (buffalo_l) — 99.77% LFW accuracy
  2.  Passive Liveness (ONNX Silent-Face) — bundled at build time
  3.  Active Liveness (MediaPipe 478-landmark challenge-response)
  4.  Deepfake/GAN Detection (DCT + face consistency + compression artifacts)
  5.  Face Attribute Analysis (age, gender, emotion via DeepFace, head-pose)
  6.  Multi-Frame Video Verification (temporal consistency)
  7.  Adaptive Threshold Engine (payment/border/event/government profiles)
  8.  Occlusion-Robust Detection (MediaPipe landmark visibility scoring)
  9.  Demographic Bias Audit (per-group FAR/FRR, forwarded to Rust service)
  10. Prometheus Metrics
  11. RS256 JWT Signed Assertions (payment SCA)
  12. Qdrant HNSW 1:N Identification
  13. Jaro-Winkler + Soundex Name Matching
"""
from __future__ import annotations
import asyncio, base64, hashlib, io, json, logging, math, os, random, secrets, time
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

import cv2
import jellyfish
import numpy as np
import redis.asyncio as aioredis
import uvicorn
from aiokafka import AIOKafkaProducer
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from skimage.feature import local_binary_pattern as skimage_lbp

logging.basicConfig(level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","msg":"%(message)s"}')
logger = logging.getLogger("face-biometric")

# ── Config ────────────────────────────────────────────────────────────────────
REDIS_URL              = os.getenv("REDIS_URL",              "redis://redis:6379")
KAFKA_BROKERS          = os.getenv("KAFKA_BROKERS",          "kafka:9092")
QDRANT_URL             = os.getenv("QDRANT_URL",             "http://qdrant:6333")
BIAS_AUDIT_URL         = os.getenv("BIAS_AUDIT_SERVICE_URL", "http://face-bias-audit:8230")
CACHE_TTL              = int(os.getenv("CACHE_TTL_SECONDS",  "86400"))
INSIGHTFACE_MODEL      = os.getenv("INSIGHTFACE_MODEL",      "buffalo_l")
INSIGHTFACE_CTX_ID     = int(os.getenv("INSIGHTFACE_CTX_ID", "-1"))
LIVENESS_MODEL_PATH    = os.getenv("LIVENESS_MODEL_PATH",    "/app/models/silent_face_anti_spoof.onnx")
JWT_PRIVATE_KEY_PATH   = os.getenv("JWT_PRIVATE_KEY_PATH",   "/app/models/jwt_private.pem")
JWT_PUBLIC_KEY_PATH    = os.getenv("JWT_PUBLIC_KEY_PATH",    "/app/models/jwt_public.pem")
JWT_TTL_SECS           = int(os.getenv("JWT_ASSERTION_TTL_SECS", "300"))
MAX_IMAGE_BYTES        = int(os.getenv("MAX_IMAGE_BYTES",    str(10 * 1024 * 1024)))
QDRANT_COLLECTION      = "face_embeddings"
EMBEDDING_DIM          = 512
CHALLENGE_TYPES        = ["blink", "turn_left", "turn_right", "smile", "nod"]

THRESHOLD_PROFILES: Dict[str, Dict[str, float]] = {
    "payment":    {"verify": 0.35, "liveness": 0.70, "quality": 0.60, "deepfake": 0.40},
    "border":     {"verify": 0.32, "liveness": 0.75, "quality": 0.65, "deepfake": 0.35},
    "event":      {"verify": 0.45, "liveness": 0.55, "quality": 0.40, "deepfake": 0.50},
    "government": {"verify": 0.38, "liveness": 0.70, "quality": 0.55, "deepfake": 0.40},
    "default":    {"verify": 0.40, "liveness": 0.60, "quality": 0.50, "deepfake": 0.45},
}

TOPIC_VERIFY     = "nexthub.face.verify.result.v1"
TOPIC_LIVENESS   = "nexthub.face.liveness.result.v1"
TOPIC_ENROLL     = "nexthub.face.enroll.result.v1"
TOPIC_IDENTIFY   = "nexthub.face.identify.result.v1"
TOPIC_DEEPFAKE   = "nexthub.face.deepfake.result.v1"
TOPIC_ATTRIBUTES = "nexthub.face.attributes.result.v1"
TOPIC_VIDEO      = "nexthub.face.video.verify.result.v1"
TOPIC_BIAS       = "nexthub.face.bias.event.v1"

# ── Pydantic Models ───────────────────────────────────────────────────────────
class FaceVerifyRequest(BaseModel):
    probe_image_b64: str
    reference_image_b64: str
    subject_id: Optional[str] = None
    tenant_id: Optional[str] = None
    require_liveness: bool = True
    require_quality: bool = True
    require_deepfake: bool = True
    context: str = "default"
    threshold_override: Optional[float] = None
    partner_id: Optional[str] = None
    consent_obtained: bool = False

class FaceLivenessRequest(BaseModel):
    image_b64: str
    tenant_id: Optional[str] = None
    context: str = "default"

class ActiveLivenessStartRequest(BaseModel):
    session_id: Optional[str] = None
    challenge_types: Optional[List[str]] = None
    tenant_id: Optional[str] = None

class ActiveLivenessVerifyRequest(BaseModel):
    session_id: str
    frames_b64: List[str] = Field(..., min_length=3, max_length=30)
    tenant_id: Optional[str] = None

class DeepfakeDetectRequest(BaseModel):
    image_b64: str
    tenant_id: Optional[str] = None
    context: str = "default"

class FaceQualityRequest(BaseModel):
    image_b64: str
    tenant_id: Optional[str] = None

class FaceAttributeRequest(BaseModel):
    image_b64: str
    tenant_id: Optional[str] = None
    actions: List[str] = Field(default=["age", "gender", "emotion", "pose"])

class FaceEnrollRequest(BaseModel):
    image_b64: str
    subject_id: str
    tenant_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

class FaceIdentifyRequest(BaseModel):
    probe_image_b64: str
    tenant_id: Optional[str] = None
    top_k: int = Field(5, ge=1, le=50)
    score_threshold: float = Field(0.60, ge=0.0, le=1.0)
    require_liveness: bool = True
    context: str = "default"

class FaceBatchProbe(BaseModel):
    probe_image_b64: str
    tenant_id: Optional[str] = None
    require_liveness: bool = True
    top_k: int = 5
    score_threshold: float = 0.60
    context: str = "default"

class FaceBatchIdentifyRequest(BaseModel):
    probes: List[FaceBatchProbe] = Field(..., min_length=1, max_length=100)
    tenant_id: Optional[str] = None

class VideoVerifyRequest(BaseModel):
    frames_b64: List[str] = Field(..., min_length=3, max_length=60)
    reference_image_b64: str
    subject_id: Optional[str] = None
    tenant_id: Optional[str] = None
    require_liveness: bool = True
    context: str = "default"

class NameMatchRequest(BaseModel):
    expected_first: Optional[str] = None
    expected_last: Optional[str] = None
    actual_first: Optional[str] = None
    actual_last: Optional[str] = None
    expected_full: Optional[str] = None
    actual_full: Optional[str] = None

# ── Response Models ───────────────────────────────────────────────────────────
class QualityMetrics(BaseModel):
    blur_score: float; brightness_score: float; contrast_score: float
    pose_yaw: float; pose_pitch: float; pose_roll: float
    resolution_ok: bool; face_size_ratio: float; occlusion_score: float = 0.0
    overall_score: float

class FaceAttributes(BaseModel):
    age_estimate: Optional[float] = None; age_bracket: Optional[str] = None
    gender: Optional[str] = None; gender_confidence: Optional[float] = None
    emotion: Optional[str] = None; emotion_scores: Optional[Dict[str, float]] = None
    pose_yaw: float = 0.0; pose_pitch: float = 0.0; pose_roll: float = 0.0
    face_landmarks_count: int = 0; occlusion_regions: List[str] = Field(default_factory=list)

class DeepfakeResult(BaseModel):
    is_deepfake: bool; deepfake_score: float; attack_type: Optional[str] = None
    dct_artifact_score: float = 0.0; consistency_score: float = 1.0; confidence: float = 0.0

class FaceVerifyResult(BaseModel):
    verified: bool; similarity: float; threshold: float; context: str
    liveness_passed: Optional[bool] = None; liveness_score: Optional[float] = None
    deepfake_passed: Optional[bool] = None; deepfake_score: Optional[float] = None
    quality_passed: Optional[bool] = None; quality_metrics: Optional[QualityMetrics] = None
    attributes: Optional[FaceAttributes] = None
    signed_assertion: Optional[str] = None; processing_ms: float = 0.0

class LivenessResult(BaseModel):
    is_live: bool; liveness_score: float; spoof_score: float
    attack_type: Optional[str] = None; method: str = "onnx"

class ActiveLivenessChallenge(BaseModel):
    session_id: str; challenge_type: str; instruction: str
    expires_at: str; nonce: str

class ActiveLivenessVerifyResult(BaseModel):
    session_id: str; passed: bool; challenge_type: str; confidence: float
    frames_analyzed: int; failure_reason: Optional[str] = None

class FaceEnrollResult(BaseModel):
    subject_id: str; enrolled: bool; embedding_id: Optional[str] = None; quality_score: float = 0.0

class FaceIdentifyResult(BaseModel):
    identified: bool; top_match_id: Optional[str] = None; top_similarity: float = 0.0
    candidates: List[Dict[str, Any]] = Field(default_factory=list)
    probe_liveness: Optional[bool] = None; deepfake_passed: Optional[bool] = None
    attributes: Optional[FaceAttributes] = None; processing_ms: float = 0.0

class FaceBatchIdentifyResult(BaseModel):
    results: List[FaceIdentifyResult]; total_probes: int
    identified_count: int; processing_ms: float

class VideoVerifyResult(BaseModel):
    verified: bool; mean_similarity: float; min_similarity: float; max_similarity: float
    frames_analyzed: int; frames_passed: int; temporal_consistency: float
    liveness_passed: Optional[bool] = None; processing_ms: float = 0.0

class NameMatchResult(BaseModel):
    score: float; first_name_score: Optional[float] = None
    last_name_score: Optional[float] = None; full_name_score: Optional[float] = None; matched: bool

# ── FastAPI App ───────────────────────────────────────────────────────────────
app = FastAPI(title="NextHub Face Biometric Service", version="3.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── Prometheus ────────────────────────────────────────────────────────────────
try:
    from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST
    VERIFY_CTR   = Counter("face_verify_total",   "Verifications",   ["result", "context"])
    LIVENESS_CTR = Counter("face_liveness_total", "Liveness checks", ["result", "method"])
    DEEPFAKE_CTR = Counter("face_deepfake_total", "Deepfake checks", ["result"])
    IDENTIFY_CTR = Counter("face_identify_total", "Identifications", ["result"])
    ENROLL_CTR   = Counter("face_enroll_total",   "Enrollments",     ["result"])
    ACTIVE_CTR   = Counter("face_active_liveness_total", "Active liveness", ["result"])
    VIDEO_CTR    = Counter("face_video_verify_total", "Video verifications", ["result"])
    LATENCY_HIST = Histogram("face_op_latency_seconds", "Latency", ["operation"],
                             buckets=[0.05,0.1,0.25,0.5,1.0,2.5,5.0,10.0])
    ENROLLED_G   = Gauge("face_enrolled_subjects", "Enrolled subjects")
    PROM_OK = True
except ImportError:
    PROM_OK = False

# ── Global State ──────────────────────────────────────────────────────────────
redis_client = kafka_producer = face_app = liveness_session = None
qdrant_client = jwt_private_key = mediapipe_face_mesh = None
jwt_public_key_pem = ""
_bias_counters: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
_active_sessions: Dict[str, Dict[str, Any]] = {}

# ── Startup ───────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    global redis_client, kafka_producer, face_app, liveness_session
    global qdrant_client, jwt_private_key, jwt_public_key_pem, mediapipe_face_mesh
    loop = asyncio.get_event_loop()
    try:
        redis_client = await aioredis.from_url(REDIS_URL, decode_responses=False)
        await redis_client.ping(); logger.info("redis_connected")
    except Exception as e:
        logger.warning(f"redis_unavailable: {e}"); redis_client = None
    try:
        kafka_producer = AIOKafkaProducer(bootstrap_servers=KAFKA_BROKERS,
            value_serializer=lambda v: json.dumps(v).encode())
        await kafka_producer.start(); logger.info("kafka_connected")
    except Exception as e:
        logger.warning(f"kafka_unavailable: {e}"); kafka_producer = None
    await loop.run_in_executor(None, _load_insightface)
    await loop.run_in_executor(None, _load_liveness_model)
    await loop.run_in_executor(None, _load_mediapipe)
    try:
        from qdrant_client import QdrantClient
        from qdrant_client.models import Distance, VectorParams
        qdrant_client = QdrantClient(url=QDRANT_URL, timeout=10)
        cols = [c.name for c in qdrant_client.get_collections().collections]
        if QDRANT_COLLECTION not in cols:
            qdrant_client.create_collection(QDRANT_COLLECTION,
                vectors_config=VectorParams(size=EMBEDDING_DIM, distance=Distance.COSINE))
        else:
            cnt = qdrant_client.count(QDRANT_COLLECTION).count
            if PROM_OK: ENROLLED_G.set(cnt)
        logger.info("qdrant_connected")
    except Exception as e:
        logger.warning(f"qdrant_unavailable: {e}"); qdrant_client = None
    try:
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.backends import default_backend
        with open(JWT_PRIVATE_KEY_PATH, "rb") as f:
            jwt_private_key = serialization.load_pem_private_key(f.read(), password=None, backend=default_backend())
        with open(JWT_PUBLIC_KEY_PATH, "r") as f:
            jwt_public_key_pem = f.read()
        logger.info("jwt_keys_loaded")
    except Exception as e:
        logger.warning(f"jwt_keys_unavailable: {e}")
    logger.info("face_biometric_service_ready version=3.0.0")

@app.on_event("shutdown")
async def shutdown():
    if kafka_producer: await kafka_producer.stop()
    if redis_client: await redis_client.close()

def _load_insightface():
    global face_app
    try:
        from insightface.app import FaceAnalysis
        fa = FaceAnalysis(name=INSIGHTFACE_MODEL,
                          providers=["CUDAExecutionProvider","CPUExecutionProvider"])
        fa.prepare(ctx_id=INSIGHTFACE_CTX_ID, det_size=(640,640))
        face_app = fa; logger.info(f"insightface_loaded model={INSIGHTFACE_MODEL}")
    except Exception as e:
        logger.error(f"insightface_load_failed: {e}"); face_app = None

def _load_liveness_model():
    global liveness_session
    try:
        import onnxruntime as ort
        if not os.path.exists(LIVENESS_MODEL_PATH):
            logger.warning(f"liveness_model_not_found path={LIVENESS_MODEL_PATH}"); return
        liveness_session = ort.InferenceSession(LIVENESS_MODEL_PATH,
            providers=["CUDAExecutionProvider","CPUExecutionProvider"])
        logger.info("liveness_model_loaded")
    except Exception as e:
        logger.error(f"liveness_model_load_failed: {e}")

def _load_mediapipe():
    global mediapipe_face_mesh
    try:
        import mediapipe as mp
        mediapipe_face_mesh = mp.solutions.face_mesh.FaceMesh(
            static_image_mode=True, max_num_faces=1,
            refine_landmarks=True, min_detection_confidence=0.5)
        logger.info("mediapipe_loaded landmarks=478")
    except Exception as e:
        logger.warning(f"mediapipe_unavailable: {e}")

# ── Image Helpers ─────────────────────────────────────────────────────────────
def decode_image(b64: str) -> np.ndarray:
    if "," in b64: b64 = b64.split(",",1)[1]
    raw = base64.b64decode(b64)
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(413, f"Image exceeds {MAX_IMAGE_BYTES} bytes")
    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None: raise HTTPException(400, "Invalid image data")
    return img

def _bbox_area(bbox) -> float:
    x1,y1,x2,y2 = bbox; return max(0.0, float((x2-x1)*(y2-y1)))

def get_embedding(img: np.ndarray) -> Tuple[np.ndarray, list]:
    if face_app is None: raise HTTPException(503, "Face model not loaded")
    faces = face_app.get(img)
    if not faces: raise HTTPException(422, "No face detected")
    best = max(faces, key=lambda f: _bbox_area(f.bbox))
    emb = best.normed_embedding if hasattr(best,"normed_embedding") else best.embedding
    emb = emb / (np.linalg.norm(emb) + 1e-10)
    return emb.astype(np.float32), faces

def cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.clip(np.dot(a, b), 0.0, 1.0))

def get_thresholds(context: str, override: Optional[float] = None) -> Dict[str, float]:
    p = THRESHOLD_PROFILES.get(context, THRESHOLD_PROFILES["default"]).copy()
    if override is not None: p["verify"] = float(np.clip(override, 0.20, 0.60))
    return p

# ── Passive Liveness ──────────────────────────────────────────────────────────
def run_liveness(img: np.ndarray, faces: list) -> Tuple[bool, float, float, Optional[str], str]:
    if not faces: return False, 0.0, 1.0, "no_face", "heuristic"
    best = max(faces, key=lambda f: _bbox_area(f.bbox))
    x1,y1,x2,y2 = [int(v) for v in best.bbox]
    h,w = img.shape[:2]
    crop = img[max(0,y1):min(h,y2), max(0,x1):min(w,x2)]
    if crop.size == 0: return False, 0.0, 1.0, "no_face", "heuristic"
    if liveness_session is not None:
        try:
            r = cv2.resize(crop,(80,80)).astype(np.float32)/255.0
            r = (r - [0.485,0.456,0.406]) / [0.229,0.224,0.225]
            inp = r.transpose(2,0,1)[np.newaxis,:].astype(np.float32)
            out = liveness_session.run(None, {liveness_session.get_inputs()[0].name: inp})[0].flatten()
            if len(out) >= 2:
                ex = np.exp(out - out.max()); pr = ex/ex.sum()
                sp, lv = float(pr[0]), float(pr[1])
            else:
                lv = float(1.0/(1.0+math.exp(-float(out[0])))); sp = 1.0-lv
            is_live = lv >= THRESHOLD_PROFILES["default"]["liveness"]
            att = None if is_live else ("print" if sp>0.90 else "replay" if sp>0.75 else "3d_mask")
            return is_live, round(lv,4), round(sp,4), att, "onnx"
        except Exception as e:
            logger.warning(f"liveness_onnx_err: {e}")
    # Heuristic fallback
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    lap = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    sharp = min(1.0, lap/500.0)
    lbp = skimage_lbp(gray, R=1, P=8, method="uniform")
    hist,_ = np.histogram(lbp.ravel(), bins=256, range=(0,256), density=True)
    hist = hist[hist>0]
    ent = float(-np.sum(hist*np.log2(hist+1e-10)))
    ent_s = min(1.0, ent/7.0)
    lv = sharp*0.5 + ent_s*0.5
    sp = 1.0 - lv
    is_live = lv >= THRESHOLD_PROFILES["default"]["liveness"]
    return is_live, round(lv,4), round(sp,4), (None if is_live else "print"), "heuristic"

# ── Deepfake Detection ────────────────────────────────────────────────────────
def run_deepfake(img: np.ndarray, faces: list) -> DeepfakeResult:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    h, w = gray.shape
    # DCT artifact analysis
    bh, bw = (h//8)*8, (w//8)*8
    gc = gray[:bh,:bw]
    dct_scores = []
    for i in range(0,bh,8):
        for j in range(0,bw,8):
            blk = gc[i:i+8,j:j+8]
            d = cv2.dct(blk)
            hf = np.sum(np.abs(d[4:,4:]))
            tot = np.sum(np.abs(d)) + 1e-6
            dct_scores.append(hf/tot)
    dct_mean = float(np.mean(dct_scores)) if dct_scores else 0.25
    dct_art = float(max(0.0, min(1.0, abs(dct_mean-0.25)/0.25)))
    # Face consistency via MediaPipe
    consistency = 1.0
    if faces and mediapipe_face_mesh is not None:
        try:
            rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            res = mediapipe_face_mesh.process(rgb)
            if res.multi_face_landmarks:
                lms = res.multi_face_landmarks[0].landmark
                nose = lms[1]
                pairs = [(33,263),(61,291),(234,454),(70,300),(105,334)]
                diffs = []
                for li,ri in pairs:
                    l,r = lms[li],lms[ri]
                    ld = math.sqrt((l.x-nose.x)**2+(l.y-nose.y)**2)
                    rd = math.sqrt((r.x-nose.x)**2+(r.y-nose.y)**2)
                    if ld+rd > 0: diffs.append(abs(ld-rd)/(ld+rd))
                if diffs: consistency = float(max(0.0, 1.0-np.mean(diffs)*4.0))
        except Exception: pass
    # Blockiness
    bs = 8; hb,wb = h//bs, w//bs; blockiness = 0.0
    if hb>1 and wb>1:
        he = gray[bs::bs,:][:hb-1,:wb*bs]
        hi = gray[bs-1:bs*(hb-1)+bs-1:bs,:][:hb-1,:wb*bs]
        blockiness = float(np.mean(np.abs(he-hi)))
    blk_s = min(1.0, blockiness/10.0)
    score = float(np.clip(dct_art*0.45 + (1.0-consistency)*0.35 + blk_s*0.20, 0.0, 1.0))
    thr = THRESHOLD_PROFILES["default"]["deepfake"]
    is_fake = score >= thr
    att = None
    if is_fake:
        att = "gan" if dct_art>0.6 else "face_swap" if consistency<0.5 else "diffusion"
    return DeepfakeResult(is_deepfake=is_fake, deepfake_score=round(score,4),
        attack_type=att, dct_artifact_score=round(dct_art,4),
        consistency_score=round(consistency,4),
        confidence=round(abs(score-thr)/(thr+1e-6),4))

# ── Quality Assessment ────────────────────────────────────────────────────────
def assess_quality(img: np.ndarray, faces: list) -> QualityMetrics:
    h,w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    lap = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    blur = min(1.0, lap/300.0)
    bri = max(0.0, 1.0-abs(gray.mean()/255.0-0.5)*2.0)
    con = min(1.0, gray.std()/128.0)
    yaw=pitch=roll=0.0; res_ok=False; fsr=0.0; occ=1.0
    if faces:
        best = max(faces, key=lambda f: _bbox_area(f.bbox))
        x1,y1,x2,y2 = best.bbox; fw,fh = float(x2-x1),float(y2-y1)
        res_ok = fw>=100 and fh>=100; fsr = float((fw*fh)/(w*h+1e-6))
        if hasattr(best,"pose") and best.pose is not None and len(best.pose)>=3:
            pitch,yaw,roll = float(best.pose[0]),float(best.pose[1]),float(best.pose[2])
    if mediapipe_face_mesh is not None and faces:
        try:
            rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            res = mediapipe_face_mesh.process(rgb)
            if res.multi_face_landmarks:
                lms = res.multi_face_landmarks[0].landmark
                vis = sum(1 for lm in lms if hasattr(lm,"visibility") and lm.visibility>0.5)
                occ = min(1.0, vis/len(lms))
        except Exception: pass
    pose_pen = max(0.0, 1.0-(abs(yaw)+abs(pitch))/60.0)
    overall = (blur*0.25 + bri*0.10 + con*0.10 + pose_pen*0.25 +
               (1.0 if res_ok else 0.0)*0.10 + min(1.0,fsr*10)*0.10 + occ*0.10)
    return QualityMetrics(blur_score=round(blur,4), brightness_score=round(bri,4),
        contrast_score=round(con,4), pose_yaw=round(yaw,2), pose_pitch=round(pitch,2),
        pose_roll=round(roll,2), resolution_ok=res_ok, face_size_ratio=round(fsr,4),
        occlusion_score=round(occ,4), overall_score=round(overall,4))

# ── Face Attributes ───────────────────────────────────────────────────────────
def get_attributes(img: np.ndarray, faces: list, actions: List[str]) -> FaceAttributes:
    age=None; abr=None; gen=None; gc=None; emo=None; emo_s=None
    yaw=pitch=roll=0.0; lmc=0; occ_r: List[str]=[]
    if faces:
        best = max(faces, key=lambda f: _bbox_area(f.bbox))
        if "age" in actions and hasattr(best,"age"):
            age = float(best.age)
            abr = "child" if age<13 else "youth" if age<25 else "adult" if age<60 else "senior"
        if "gender" in actions and hasattr(best,"gender"):
            gen = "male" if best.gender==1 else "female"
            gc = float(getattr(best,"gender_score",0.8))
        if hasattr(best,"pose") and best.pose is not None and len(best.pose)>=3:
            pitch,yaw,roll = float(best.pose[0]),float(best.pose[1]),float(best.pose[2])
    if "emotion" in actions:
        try:
            from deepface import DeepFace
            rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            r = DeepFace.analyze(img_path=rgb, actions=["emotion"],
                                  enforce_detection=False, silent=True)
            if isinstance(r,list): r=r[0]
            emo_s = {k:round(float(v),4) for k,v in r.get("emotion",{}).items()}
            emo = r.get("dominant_emotion")
        except Exception: pass
    if mediapipe_face_mesh is not None:
        try:
            rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            res = mediapipe_face_mesh.process(rgb)
            if res.multi_face_landmarks:
                lms = res.multi_face_landmarks[0].landmark; lmc = len(lms)
                for region,idx in [("nose",1),("left_eye",33),("right_eye",263),("mouth",13),("chin",152)]:
                    lm = lms[idx]
                    if hasattr(lm,"visibility") and lm.visibility<0.3: occ_r.append(region)
        except Exception: pass
    return FaceAttributes(age_estimate=round(age,1) if age else None, age_bracket=abr,
        gender=gen, gender_confidence=round(gc,4) if gc else None,
        emotion=emo, emotion_scores=emo_s,
        pose_yaw=round(yaw,2), pose_pitch=round(pitch,2), pose_roll=round(roll,2),
        face_landmarks_count=lmc, occlusion_regions=occ_r)

# ── Bias Audit ────────────────────────────────────────────────────────────────
def _record_bias(op: str, result: bool, attrs: Optional[FaceAttributes], ctx: str):
    if attrs is None: return
    key = f"{op}:{ctx}:{attrs.age_bracket or 'unknown'}:{attrs.gender or 'unknown'}"
    _bias_counters[key]["total"] += 1
    _bias_counters[key]["passed" if result else "failed"] += 1

async def _flush_bias():
    if not _bias_counters: return
    snap = dict(_bias_counters); _bias_counters.clear()
    payload = {"timestamp": datetime.now(timezone.utc).isoformat(),
               "events": [{"key":k,"counts":v} for k,v in snap.items()]}
    if kafka_producer:
        try: await kafka_producer.send(TOPIC_BIAS, payload)
        except Exception: pass
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5.0) as c:
            await c.post(f"{BIAS_AUDIT_URL}/v1/bias/ingest", json=payload)
    except Exception: pass

# ── JWT Assertions ────────────────────────────────────────────────────────────
def _sign_assertion(subject_id: str, sim: float, live: bool, ctx: str) -> Optional[str]:
    if jwt_private_key is None: return None
    try:
        import jwt as pyjwt
        now = datetime.now(timezone.utc)
        payload = {"iss":"nexthub-face-biometric","sub":subject_id,
                   "iat":int(now.timestamp()),
                   "exp":int((now+timedelta(seconds=JWT_TTL_SECS)).timestamp()),
                   "similarity":round(sim,4),"liveness_passed":live,
                   "context":ctx,"jti":secrets.token_hex(16)}
        return pyjwt.encode(payload, jwt_private_key, algorithm="RS256")
    except Exception as e:
        logger.warning(f"jwt_sign_failed: {e}"); return None

# ── Name Matching ─────────────────────────────────────────────────────────────
def _jw(a: str, b: str) -> float:
    if not a and not b: return 1.0
    if not a or not b: return 0.0
    return float(jellyfish.jaro_winkler_similarity(a.lower().strip(), b.lower().strip()))

def _soundex_boost(a: str, b: str, score: float) -> float:
    try:
        if jellyfish.soundex(a) == jellyfish.soundex(b) and score < 0.85: return max(score, 0.75)
    except Exception: pass
    return score

def compute_name_match(ef,el,af,al,efull,afull) -> Tuple[float,Optional[float],Optional[float],Optional[float]]:
    scores = []
    fs=ls=fls=None
    if efull and afull:
        fls = _soundex_boost(efull.split()[0] if efull.split() else efull,
                             afull.split()[0] if afull.split() else afull, _jw(efull,afull))
        scores.append((fls,1.0))
    if ef and af:
        fs = _soundex_boost(ef, af, _jw(ef, af)); scores.append((fs,0.40))
    if el and al:
        ls = _soundex_boost(el, al, _jw(el, al)); scores.append((ls,0.60))
    if not scores: return 0.0,None,None,None
    tw = sum(w for _,w in scores)
    overall = sum(s*w for s,w in scores)/tw
    return round(overall,4),(round(fs,4) if fs else None),(round(ls,4) if ls else None),(round(fls,4) if fls else None)

# ── Kafka Helper ──────────────────────────────────────────────────────────────
async def publish(topic: str, payload: dict):
    if kafka_producer:
        try: await kafka_producer.send(topic, {**payload,"_ts":datetime.now(timezone.utc).isoformat()})
        except Exception as e: logger.warning(f"kafka_err topic={topic}: {e}")

# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status":"ok","version":"3.0.0",
            "insightface":face_app is not None,"liveness_onnx":liveness_session is not None,
            "mediapipe":mediapipe_face_mesh is not None,"qdrant":qdrant_client is not None,
            "redis":redis_client is not None,"kafka":kafka_producer is not None,
            "jwt_keys":jwt_private_key is not None}

@app.get("/metrics")
async def metrics():
    if not PROM_OK: raise HTTPException(501,"Prometheus not available")
    from starlette.responses import Response
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

# 1:1 Verify
@app.post("/v1/face/verify", response_model=FaceVerifyResult)
async def verify_face(req: FaceVerifyRequest, bg: BackgroundTasks):
    t0 = time.perf_counter()
    thr = get_thresholds(req.context, req.threshold_override)
    probe_img = decode_image(req.probe_image_b64)
    ref_img   = decode_image(req.reference_image_b64)
    probe_emb, probe_faces = get_embedding(probe_img)
    ref_emb,   _           = get_embedding(ref_img)
    sim = cosine_sim(probe_emb, ref_emb)
    threshold = 1.0 - thr["verify"]
    quality_metrics = quality_passed = None
    if req.require_quality:
        quality_metrics = assess_quality(probe_img, probe_faces)
        quality_passed = quality_metrics.overall_score >= thr["quality"]
    liveness_passed = liveness_score = None
    if req.require_liveness:
        is_live,lv,sp,att,meth = run_liveness(probe_img, probe_faces)
        liveness_passed = is_live; liveness_score = lv
        if PROM_OK: LIVENESS_CTR.labels(result="pass" if is_live else "fail",method=meth).inc()
    deepfake_passed = df_score = None
    if req.require_deepfake:
        df = run_deepfake(probe_img, probe_faces)
        deepfake_passed = not df.is_deepfake; df_score = df.deepfake_score
        if PROM_OK: DEEPFAKE_CTR.labels(result="real" if deepfake_passed else "fake").inc()
    attrs = get_attributes(probe_img, probe_faces, ["age","gender","emotion","pose"])
    verified = (sim >= threshold and
                (liveness_passed is None or liveness_passed) and
                (deepfake_passed is None or deepfake_passed) and
                (quality_passed  is None or quality_passed))
    signed = None
    if verified and req.subject_id and req.context in ("payment","border","government"):
        signed = _sign_assertion(req.subject_id, sim, bool(liveness_passed), req.context)
    ms = round((time.perf_counter()-t0)*1000,2)
    result = FaceVerifyResult(verified=verified, similarity=round(sim,4),
        threshold=round(threshold,4), context=req.context,
        liveness_passed=liveness_passed, liveness_score=liveness_score,
        deepfake_passed=deepfake_passed, deepfake_score=round(df_score,4) if df_score else None,
        quality_passed=quality_passed, quality_metrics=quality_metrics,
        attributes=attrs, signed_assertion=signed, processing_ms=ms)
    if PROM_OK:
        VERIFY_CTR.labels(result="pass" if verified else "fail",context=req.context).inc()
        LATENCY_HIST.labels(operation="verify").observe(time.perf_counter()-t0)
    bg.add_task(_record_bias,"verify",verified,attrs,req.context)
    bg.add_task(publish,TOPIC_VERIFY,{"verified":verified,"similarity":sim,"context":req.context,
        "subject_id":req.subject_id,"tenant_id":req.tenant_id})
    bg.add_task(_flush_bias)
    return result

# Passive Liveness
@app.post("/v1/face/liveness", response_model=LivenessResult)
async def check_liveness(req: FaceLivenessRequest, bg: BackgroundTasks):
    img = decode_image(req.image_b64)
    try: _,faces = get_embedding(img)
    except HTTPException: faces=[]
    is_live,lv,sp,att,meth = run_liveness(img, faces)
    result = LivenessResult(is_live=is_live,liveness_score=lv,spoof_score=sp,attack_type=att,method=meth)
    if PROM_OK: LIVENESS_CTR.labels(result="pass" if is_live else "fail",method=meth).inc()
    bg.add_task(publish,TOPIC_LIVENESS,result.model_dump())
    return result

# Active Liveness — Start
@app.post("/v1/face/liveness/active", response_model=ActiveLivenessChallenge)
async def start_active_liveness(req: ActiveLivenessStartRequest):
    ctype = random.choice(req.challenge_types or CHALLENGE_TYPES)
    sid = req.session_id or secrets.token_hex(16)
    nonce = secrets.token_hex(8)
    exp = (datetime.now(timezone.utc)+timedelta(seconds=60)).isoformat()
    instrs = {"blink":"Please blink both eyes slowly",
              "turn_left":"Please slowly turn your head to the left",
              "turn_right":"Please slowly turn your head to the right",
              "smile":"Please smile naturally","nod":"Please nod your head up and down"}
    _active_sessions[sid] = {"challenge_type":ctype,"nonce":nonce,"expires_at":exp,
                              "created_at":time.time(),"tenant_id":req.tenant_id}
    return ActiveLivenessChallenge(session_id=sid,challenge_type=ctype,
        instruction=instrs.get(ctype,"Follow the instruction"),expires_at=exp,nonce=nonce)

# Active Liveness — Verify
@app.post("/v1/face/liveness/active/verify", response_model=ActiveLivenessVerifyResult)
async def verify_active_liveness(req: ActiveLivenessVerifyRequest, bg: BackgroundTasks):
    sess = _active_sessions.pop(req.session_id, None)
    if sess is None: raise HTTPException(404,"Session not found or expired")
    if time.time()-sess["created_at"]>60: raise HTTPException(410,"Session expired")
    if mediapipe_face_mesh is None: raise HTTPException(503,"MediaPipe not available")
    import mediapipe as mp
    frames=[]; [frames.append(decode_image(b)) for b in req.frames_b64 if True]
    frame_lms=[]
    for frm in frames:
        rgb=cv2.cvtColor(frm,cv2.COLOR_BGR2RGB)
        res=mediapipe_face_mesh.process(rgb)
        frame_lms.append(res.multi_face_landmarks[0].landmark if res.multi_face_landmarks else None)
    valid=[lm for lm in frame_lms if lm is not None]
    if len(valid)<3:
        return ActiveLivenessVerifyResult(session_id=req.session_id,passed=False,
            challenge_type=sess["challenge_type"],confidence=0.0,
            frames_analyzed=len(frames),failure_reason="insufficient_face_detections")
    ctype=sess["challenge_type"]; passed=False; conf=0.0; reason=None
    if ctype=="blink":
        def ear(lms,idx):
            p=[lms[i] for i in idx]
            v1=math.sqrt((p[1].x-p[5].x)**2+(p[1].y-p[5].y)**2)
            v2=math.sqrt((p[2].x-p[4].x)**2+(p[2].y-p[4].y)**2)
            h=math.sqrt((p[0].x-p[3].x)**2+(p[0].y-p[3].y)**2)
            return (v1+v2)/(2.0*h+1e-6)
        ears=[(ear(lm,[33,160,158,133,153,144])+ear(lm,[362,385,387,263,373,380]))/2 for lm in valid]
        passed=min(ears)<0.20 and max(ears)>0.25
        conf=min(1.0,(max(ears)-min(ears))/0.15); reason=None if passed else "no_blink_detected"
    elif ctype in ("turn_left","turn_right"):
        xs=[lm[1].x for lm in valid]; xr=max(xs)-min(xs)
        dok=(xs[-1]<xs[0]-0.03) if ctype=="turn_left" else (xs[-1]>xs[0]+0.03)
        passed=xr>0.05 and dok; conf=min(1.0,xr/0.10); reason=None if passed else "insufficient_head_turn"
    elif ctype=="smile":
        def mr(lms):
            mw=math.sqrt((lms[61].x-lms[291].x)**2+(lms[61].y-lms[291].y)**2)
            mh=math.sqrt((lms[13].x-lms[14].x)**2+(lms[13].y-lms[14].y)**2)
            return mw/(mh+1e-6)
        ratios=[mr(lm) for lm in valid]; mx=max(ratios)
        passed=mx>4.5; conf=min(1.0,mx/6.0); reason=None if passed else "no_smile_detected"
    elif ctype=="nod":
        ys=[lm[1].y for lm in valid]; yr=max(ys)-min(ys)
        passed=yr>0.04; conf=min(1.0,yr/0.08); reason=None if passed else "insufficient_nod"
    if PROM_OK: ACTIVE_CTR.labels(result="pass" if passed else "fail").inc()
    result=ActiveLivenessVerifyResult(session_id=req.session_id,passed=passed,
        challenge_type=ctype,confidence=round(conf,4),frames_analyzed=len(frames),failure_reason=reason)
    bg.add_task(publish,TOPIC_LIVENESS,{**result.model_dump(),"mode":"active"})
    return result

# Deepfake Detection
@app.post("/v1/face/deepfake", response_model=DeepfakeResult)
async def detect_deepfake(req: DeepfakeDetectRequest, bg: BackgroundTasks):
    img=decode_image(req.image_b64)
    try: _,faces=get_embedding(img)
    except HTTPException: faces=[]
    result=run_deepfake(img,faces)
    if PROM_OK: DEEPFAKE_CTR.labels(result="fake" if result.is_deepfake else "real").inc()
    bg.add_task(publish,TOPIC_DEEPFAKE,result.model_dump())
    return result

# Quality Assessment
@app.post("/v1/face/quality", response_model=QualityMetrics)
async def check_quality(req: FaceQualityRequest):
    img=decode_image(req.image_b64)
    try: _,faces=get_embedding(img)
    except HTTPException: faces=[]
    return assess_quality(img,faces)

# Face Attributes
@app.post("/v1/face/attributes", response_model=FaceAttributes)
async def analyze_attributes(req: FaceAttributeRequest, bg: BackgroundTasks):
    img=decode_image(req.image_b64)
    try: _,faces=get_embedding(img)
    except HTTPException: faces=[]
    result=get_attributes(img,faces,req.actions)
    bg.add_task(publish,TOPIC_ATTRIBUTES,result.model_dump())
    return result

# Enroll
@app.post("/v1/face/enroll", response_model=FaceEnrollResult)
async def enroll_face(req: FaceEnrollRequest, bg: BackgroundTasks):
    img=decode_image(req.image_b64)
    emb,faces=get_embedding(img)
    q=assess_quality(img,faces)
    if q.overall_score<THRESHOLD_PROFILES["default"]["quality"]:
        raise HTTPException(422,f"Image quality too low: {q.overall_score:.2f}")
    if qdrant_client is None: raise HTTPException(503,"Qdrant not available")
    from qdrant_client.models import PointStruct
    eid=hashlib.sha256(f"{req.subject_id}:{req.tenant_id}".encode()).hexdigest()[:32]
    qdrant_client.upsert(QDRANT_COLLECTION,points=[PointStruct(
        id=int(hashlib.sha256(eid.encode()).hexdigest()[:8],16),
        vector=emb.tolist(),
        payload={"subject_id":req.subject_id,"tenant_id":req.tenant_id,
                 "metadata":req.metadata or {},"enrolled_at":datetime.now(timezone.utc).isoformat()})])
    if PROM_OK: ENROLLED_G.inc(); ENROLL_CTR.labels(result="success").inc()
    result=FaceEnrollResult(subject_id=req.subject_id,enrolled=True,embedding_id=eid,quality_score=round(q.overall_score,4))
    bg.add_task(publish,TOPIC_ENROLL,result.model_dump())
    return result

# 1:N Identify
@app.post("/v1/face/identify", response_model=FaceIdentifyResult)
async def identify_face(req: FaceIdentifyRequest, bg: BackgroundTasks):
    t0=time.perf_counter()
    img=decode_image(req.probe_image_b64)
    emb,faces=get_embedding(img)
    lp=None
    if req.require_liveness:
        is_live,_,_,_,_=run_liveness(img,faces); lp=is_live
        if not is_live:
            return FaceIdentifyResult(identified=False,probe_liveness=False,
                                      processing_ms=round((time.perf_counter()-t0)*1000,2))
    df=run_deepfake(img,faces); dfp=not df.is_deepfake
    attrs=get_attributes(img,faces,["age","gender","pose"])
    cands=[]; identified=False; top_id=None; top_sim=0.0
    if qdrant_client is not None:
        try:
            hits=qdrant_client.search(QDRANT_COLLECTION,query_vector=emb.tolist(),
                limit=req.top_k,score_threshold=req.score_threshold,
                query_filter={"must":[{"key":"tenant_id","match":{"value":req.tenant_id}}]} if req.tenant_id else None)
            for h in hits:
                cands.append({"subject_id":h.payload.get("subject_id"),"similarity":round(float(h.score),4),"metadata":h.payload.get("metadata",{})})
            if cands: identified=True; top_id=cands[0]["subject_id"]; top_sim=cands[0]["similarity"]
        except Exception as e: logger.error(f"qdrant_search_failed: {e}")
    ms=round((time.perf_counter()-t0)*1000,2)
    result=FaceIdentifyResult(identified=identified,top_match_id=top_id,top_similarity=top_sim,
        candidates=cands,probe_liveness=lp,deepfake_passed=dfp,attributes=attrs,processing_ms=ms)
    if PROM_OK:
        IDENTIFY_CTR.labels(result="found" if identified else "not_found").inc()
        LATENCY_HIST.labels(operation="identify").observe(time.perf_counter()-t0)
    bg.add_task(_record_bias,"identify",identified,attrs,req.context)
    bg.add_task(publish,TOPIC_IDENTIFY,{"identified":identified,"top_match_id":top_id,"tenant_id":req.tenant_id})
    bg.add_task(_flush_bias)
    return result

# Batch Identify
@app.post("/v1/face/batch-identify", response_model=FaceBatchIdentifyResult)
async def batch_identify(req: FaceBatchIdentifyRequest, bg: BackgroundTasks):
    t0=time.perf_counter(); results=[]
    for probe in req.probes:
        try:
            r=await identify_face(FaceIdentifyRequest(
                probe_image_b64=probe.probe_image_b64,
                tenant_id=probe.tenant_id or req.tenant_id,
                top_k=probe.top_k,score_threshold=probe.score_threshold,
                require_liveness=probe.require_liveness,context=probe.context),BackgroundTasks())
            results.append(r)
        except Exception: results.append(FaceIdentifyResult(identified=False,processing_ms=0.0))
    return FaceBatchIdentifyResult(results=results,total_probes=len(results),
        identified_count=sum(1 for r in results if r.identified),
        processing_ms=round((time.perf_counter()-t0)*1000,2))

# Video Verify
@app.post("/v1/face/video-verify", response_model=VideoVerifyResult)
async def video_verify(req: VideoVerifyRequest, bg: BackgroundTasks):
    t0=time.perf_counter()
    thr=get_thresholds(req.context)
    ref_img=decode_image(req.reference_image_b64)
    ref_emb,_=get_embedding(ref_img)
    sims=[]; lv_scores=[]; analyzed=0
    for b64 in req.frames_b64:
        try:
            frm=decode_image(b64); emb,faces=get_embedding(frm)
            sims.append(cosine_sim(emb,ref_emb))
            if req.require_liveness:
                _,lv,_,_,_=run_liveness(frm,faces); lv_scores.append(lv)
            analyzed+=1
        except Exception: continue
    if not sims: raise HTTPException(422,"No valid frames with detectable faces")
    mean_s=float(np.mean(sims)); min_s=float(np.min(sims)); max_s=float(np.max(sims))
    std_s=float(np.std(sims)); thr_v=1.0-thr["verify"]
    tc=float(max(0.0,1.0-std_s*10.0)); fp=sum(1 for s in sims if s>=thr_v)
    verified=(mean_s>=thr_v and fp>=len(sims)*0.7 and tc>=0.5)
    lp=None
    if lv_scores: lp=float(np.mean(lv_scores))>=thr["liveness"]
    ms=round((time.perf_counter()-t0)*1000,2)
    result=VideoVerifyResult(verified=verified,mean_similarity=round(mean_s,4),
        min_similarity=round(min_s,4),max_similarity=round(max_s,4),
        frames_analyzed=analyzed,frames_passed=fp,temporal_consistency=round(tc,4),
        liveness_passed=lp,processing_ms=ms)
    if PROM_OK: VIDEO_CTR.labels(result="pass" if verified else "fail").inc()
    bg.add_task(publish,TOPIC_VIDEO,{"verified":verified,"mean_similarity":mean_s,"frames_analyzed":analyzed})
    return result

# Name Match
@app.post("/v1/name/match", response_model=NameMatchResult)
async def match_name(req: NameMatchRequest):
    score,fs,ls,fls=compute_name_match(req.expected_first,req.expected_last,
        req.actual_first,req.actual_last,req.expected_full,req.actual_full)
    return NameMatchResult(score=score,first_name_score=fs,last_name_score=ls,
                           full_name_score=fls,matched=score>=0.70)

# Public Key
@app.get("/v1/face/public-key")
async def get_public_key():
    if not jwt_public_key_pem: raise HTTPException(503,"JWT keys not loaded")
    return {"public_key":jwt_public_key_pem,"algorithm":"RS256"}

# Bias Audit
@app.get("/v1/audit/bias")
async def get_bias_audit():
    try:
        import httpx
        async with httpx.AsyncClient(timeout=10.0) as c:
            resp=await c.get(f"{BIAS_AUDIT_URL}/v1/bias/report")
            if resp.status_code==200: return resp.json()
    except Exception: pass
    report={}
    for key,counts in _bias_counters.items():
        parts=key.split(":")
        if len(parts)==4:
            op,ctx,abr,gen=parts; tot=counts.get("total",0)
            report[key]={"operation":op,"context":ctx,"age_bracket":abr,"gender":gen,
                         "total":tot,"passed":counts.get("passed",0),"failed":counts.get("failed",0),
                         "far":round(counts.get("failed",0)/(tot+1e-6),4)}
    return {"source":"in_memory","report":report,"timestamp":datetime.now(timezone.utc).isoformat()}

if __name__=="__main__":
    uvicorn.run("main:app",host="0.0.0.0",port=8220,workers=2,log_level="info")
