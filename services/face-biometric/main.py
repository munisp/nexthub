"""
face-biometric/main.py — NextHub Face Biometric Sidecar Service v2.0
═══════════════════════════════════════════════════════════════════════
Gap fixes applied (v2):
  ✅ Qdrant HNSW vector index for O(log N) 1:N identification at scale
  ✅ GPU/CUDA provider auto-selection (falls back to CPU if no GPU)
  ✅ scikit-image LBP replaces O(h×w) pure-Python loop
  ✅ RS256 JWT signed payment assertion endpoint
  ✅ Batch identification endpoint (/v1/face/batch-identify)
  ✅ ONNX liveness model bundled in Dockerfile
"""
from __future__ import annotations
import asyncio, base64, hashlib, json, logging, math, os, time, uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple
import cv2
import numpy as np
from aiokafka import AIOKafkaProducer
from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from redis import asyncio as aioredis
from skimage.feature import local_binary_pattern

logging.basicConfig(level=logging.INFO, format='{"time":"%(asctime)s","level":"%(levelname)s","msg":"%(message)s"}')
logger = logging.getLogger("face-biometric")

# ── Config ────────────────────────────────────────────────────────────────────
REDIS_URL             = os.getenv("REDIS_URL",             "redis://redis:6379")
KAFKA_BROKERS         = os.getenv("KAFKA_BROKERS",         "kafka:9092")
CACHE_TTL_SECONDS     = int(os.getenv("CACHE_TTL_SECONDS", "86400"))
INSIGHTFACE_MODEL     = os.getenv("INSIGHTFACE_MODEL",     "buffalo_l")
INSIGHTFACE_CTX_ID    = int(os.getenv("INSIGHTFACE_CTX_ID", "-1"))
LIVENESS_MODEL_PATH   = os.getenv("LIVENESS_MODEL_PATH",  "/app/models/silent_face_anti_spoof.onnx")
FACE_VERIFY_THRESHOLD = float(os.getenv("FACE_VERIFY_THRESHOLD", "0.40"))
LIVENESS_THRESHOLD    = float(os.getenv("LIVENESS_THRESHOLD",    "0.60"))
QUALITY_MIN_SCORE     = float(os.getenv("QUALITY_MIN_SCORE",     "0.50"))
MAX_IMAGE_BYTES       = int(os.getenv("MAX_IMAGE_BYTES",   str(5 * 1024 * 1024)))
QDRANT_URL            = os.getenv("QDRANT_URL",        "http://qdrant:6333")
QDRANT_COLLECTION     = os.getenv("QDRANT_COLLECTION", "face_embeddings")
QDRANT_VECTOR_SIZE    = 512
JWT_PRIVATE_KEY_PATH  = os.getenv("JWT_PRIVATE_KEY_PATH", "/app/models/jwt_private.pem")
JWT_PUBLIC_KEY_PATH   = os.getenv("JWT_PUBLIC_KEY_PATH",  "/app/models/jwt_public.pem")
JWT_ISSUER            = os.getenv("JWT_ISSUER",           "nexthub-face-biometric")
JWT_ASSERTION_TTL_SEC = int(os.getenv("JWT_ASSERTION_TTL_SEC", "300"))

TOPIC_FACE_VERIFY   = "nexthub.face.verify.result.v1"
TOPIC_FACE_LIVENESS = "nexthub.face.liveness.result.v1"
TOPIC_FACE_ENROLL   = "nexthub.face.enroll.result.v1"
TOPIC_FACE_IDENTIFY = "nexthub.face.identify.result.v1"
TOPIC_FACE_BATCH    = "nexthub.face.batch.result.v1"
TOPIC_FACE_FAILED   = "nexthub.face.failed.v1"

# ── Pydantic Models ───────────────────────────────────────────────────────────
class FaceVerifyRequest(BaseModel):
    probe_image_b64:     str
    reference_image_b64: str
    subject_id:          Optional[str] = None
    tenant_id:           Optional[str] = None
    require_liveness:    bool = True
    require_quality:     bool = True
    min_quality_score:   float = 0.50
    issue_assertion:     bool = False

class FaceLivenessRequest(BaseModel):
    image_b64:  str
    subject_id: Optional[str] = None
    tenant_id:  Optional[str] = None

class FaceQualityRequest(BaseModel):
    image_b64:  str
    subject_id: Optional[str] = None
    tenant_id:  Optional[str] = None

class FaceEnrollRequest(BaseModel):
    image_b64:        str
    subject_id:       str
    tenant_id:        Optional[str] = None
    require_liveness: bool = True
    require_quality:  bool = True

class FaceIdentifyRequest(BaseModel):
    probe_image_b64:  str
    tenant_id:        Optional[str] = None
    require_liveness: bool = True
    top_k:            int = Field(5, ge=1, le=50)
    score_threshold:  float = Field(0.40)

class FaceBatchIdentifyRequest(BaseModel):
    probes:    List[FaceIdentifyRequest]
    tenant_id: Optional[str] = None

class NameMatchRequest(BaseModel):
    expected_first: Optional[str] = None
    expected_last:  Optional[str] = None
    actual_first:   Optional[str] = None
    actual_last:    Optional[str] = None
    expected_full:  Optional[str] = None
    actual_full:    Optional[str] = None

class QualityMetrics(BaseModel):
    blur_score: float; brightness_score: float; contrast_score: float
    pose_yaw: float; pose_pitch: float; pose_roll: float
    resolution_ok: bool; face_size_ratio: float; overall_score: float

class FaceVerifyResult(BaseModel):
    verified: bool; similarity: float; distance: float; threshold: float
    liveness_passed: Optional[bool] = None; liveness_score: Optional[float] = None
    quality_passed: Optional[bool] = None; quality_metrics: Optional[QualityMetrics] = None
    face_count_probe: int = 0; face_count_ref: int = 0
    subject_id: Optional[str] = None; image_hash_probe: str = ""
    verified_at: str = ""; processing_ms: float = 0.0; cached: bool = False
    assertion_jwt: Optional[str] = None

class FaceLivenessResult(BaseModel):
    is_live: bool; spoof_score: float; liveness_score: float
    attack_type: Optional[str] = None; face_detected: bool = False
    subject_id: Optional[str] = None; image_hash: str = ""
    checked_at: str = ""; processing_ms: float = 0.0; cached: bool = False

class FaceQualityResult(BaseModel):
    quality_passed: bool; quality_score: float; metrics: QualityMetrics
    subject_id: Optional[str] = None; processing_ms: float = 0.0

class FaceEnrollResult(BaseModel):
    enrolled: bool; subject_id: str; embedding_dim: int = 0
    liveness_passed: Optional[bool] = None; quality_passed: Optional[bool] = None
    enrolled_at: str = ""; processing_ms: float = 0.0

class FaceIdentifyMatch(BaseModel):
    subject_id: str; similarity: float; distance: float; verified: bool

class FaceIdentifyResult(BaseModel):
    identified: bool; top_match_id: Optional[str] = None; top_similarity: float = 0.0
    matches: List[FaceIdentifyMatch] = []; probe_liveness: Optional[bool] = None
    processing_ms: float = 0.0

class FaceBatchIdentifyResult(BaseModel):
    results: List[FaceIdentifyResult]; total_probes: int
    identified_count: int; processing_ms: float = 0.0

class NameMatchResult(BaseModel):
    match_score: float; first_name_score: Optional[float] = None
    last_name_score: Optional[float] = None; full_name_score: Optional[float] = None
    matched: bool

# ── Global State ──────────────────────────────────────────────────────────────
redis_client:     Any = None
kafka_producer:   Any = None
face_app:         Any = None
liveness_session: Any = None
qdrant_client:    Any = None
jwt_private_key:  Optional[bytes] = None
jwt_public_key:   Optional[bytes] = None

app = FastAPI(title="NextHub Face Biometric Service", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── Startup / Shutdown ────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    global redis_client, kafka_producer
    try:
        redis_client = await aioredis.from_url(REDIS_URL, encoding="utf-8", decode_responses=True)
        await redis_client.ping()
        logger.info("redis_connected")
    except Exception as e:
        logger.warning(f"redis_unavailable: {e}"); redis_client = None
    try:
        kafka_producer = AIOKafkaProducer(bootstrap_servers=KAFKA_BROKERS, compression_type="snappy", linger_ms=5)
        await kafka_producer.start()
        logger.info("kafka_connected")
    except Exception as e:
        logger.warning(f"kafka_unavailable: {e}"); kafka_producer = None
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _init_qdrant)
    await loop.run_in_executor(None, _load_insightface)
    await loop.run_in_executor(None, _load_liveness_model)
    _load_jwt_keys()
    logger.info("face_biometric_service.started v2.0.0")

@app.on_event("shutdown")
async def shutdown():
    if kafka_producer: await kafka_producer.stop()
    if redis_client: await redis_client.close()

def _get_onnx_providers() -> List[str]:
    try:
        import onnxruntime as ort
        if "CUDAExecutionProvider" in ort.get_available_providers():
            logger.info("gpu_detected: CUDAExecutionProvider")
            return ["CUDAExecutionProvider", "CPUExecutionProvider"]
    except Exception: pass
    return ["CPUExecutionProvider"]

def _init_qdrant():
    global qdrant_client
    try:
        from qdrant_client import QdrantClient
        from qdrant_client.models import Distance, VectorParams, HnswConfigDiff, OptimizersConfigDiff
        qc = QdrantClient(url=QDRANT_URL, timeout=10)
        existing = [c.name for c in qc.get_collections().collections]
        if QDRANT_COLLECTION not in existing:
            qc.create_collection(
                collection_name=QDRANT_COLLECTION,
                vectors_config=VectorParams(size=QDRANT_VECTOR_SIZE, distance=Distance.COSINE),
                hnsw_config=HnswConfigDiff(m=16, ef_construct=200, full_scan_threshold=10000),
                optimizers_config=OptimizersConfigDiff(indexing_threshold=20000),
            )
            logger.info(f"qdrant_collection_created name={QDRANT_COLLECTION}")
        else:
            logger.info(f"qdrant_collection_exists name={QDRANT_COLLECTION}")
        qdrant_client = qc
    except Exception as e:
        logger.error(f"qdrant_init_failed: {e}"); qdrant_client = None

def _load_insightface():
    global face_app
    try:
        from insightface.app import FaceAnalysis
        providers = _get_onnx_providers()
        fa = FaceAnalysis(name=INSIGHTFACE_MODEL, providers=providers)
        fa.prepare(ctx_id=INSIGHTFACE_CTX_ID, det_size=(640, 640))
        face_app = fa
        logger.info(f"insightface_loaded model={INSIGHTFACE_MODEL} providers={providers}")
    except Exception as e:
        logger.error(f"insightface_load_failed: {e}"); face_app = None

def _load_liveness_model():
    global liveness_session
    if not os.path.exists(LIVENESS_MODEL_PATH):
        logger.warning(f"liveness_model_not_found path={LIVENESS_MODEL_PATH} — heuristic fallback active")
        liveness_session = None; return
    try:
        import onnxruntime as ort
        opts = ort.SessionOptions(); opts.intra_op_num_threads = 4
        liveness_session = ort.InferenceSession(LIVENESS_MODEL_PATH, sess_options=opts, providers=_get_onnx_providers())
        logger.info(f"liveness_model_loaded path={LIVENESS_MODEL_PATH}")
    except Exception as e:
        logger.error(f"liveness_model_load_failed: {e}"); liveness_session = None

def _load_jwt_keys():
    global jwt_private_key, jwt_public_key
    try:
        if os.path.exists(JWT_PRIVATE_KEY_PATH):
            jwt_private_key = open(JWT_PRIVATE_KEY_PATH, "rb").read()
        if os.path.exists(JWT_PUBLIC_KEY_PATH):
            jwt_public_key = open(JWT_PUBLIC_KEY_PATH, "rb").read()
        logger.info(f"jwt_keys_loaded private={jwt_private_key is not None}")
    except Exception as e:
        logger.error(f"jwt_key_load_failed: {e}")

# ── Image Helpers ─────────────────────────────────────────────────────────────
def decode_image(b64: str) -> np.ndarray:
    if "," in b64: b64 = b64.split(",", 1)[1]
    raw = base64.b64decode(b64)
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(413, f"Image too large: {len(raw)} bytes")
    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None: raise HTTPException(400, "Cannot decode image")
    return img

def image_hash(b64: str) -> str:
    if "," in b64: b64 = b64.split(",", 1)[1]
    return hashlib.sha256(b64.encode()).hexdigest()

# ── Face Detection & Embedding ────────────────────────────────────────────────
def detect_faces(img: np.ndarray) -> List[Any]:
    if face_app is None: raise HTTPException(503, "Face model not loaded")
    return face_app.get(img)

def get_embedding(faces: List[Any]) -> Optional[np.ndarray]:
    if not faces: return None
    best = max(faces, key=lambda f: _bbox_area(f.bbox))
    emb = best.embedding
    if emb is None: return None
    norm = np.linalg.norm(emb)
    return emb / norm if norm > 0 else emb

def _bbox_area(bbox) -> float:
    x1,y1,x2,y2 = bbox; return max(0.0, float((x2-x1)*(y2-y1)))

def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.clip(np.dot(a, b), -1.0, 1.0))

def cosine_distance(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.clip(1.0 - np.dot(a, b), 0.0, 2.0))

# ── Liveness Detection ────────────────────────────────────────────────────────
def run_liveness(img: np.ndarray, faces: List[Any]) -> Tuple[bool, float, Optional[str]]:
    if not faces: return False, 0.0, None
    best = max(faces, key=lambda f: _bbox_area(f.bbox))
    x1,y1,x2,y2 = [int(v) for v in best.bbox]
    h,w = img.shape[:2]
    mx,my = int((x2-x1)*0.20), int((y2-y1)*0.20)
    crop = img[max(0,y1-my):min(h,y2+my), max(0,x1-mx):min(w,x2+mx)]
    if liveness_session is not None:
        inp = _preprocess_liveness(crop)
        out = liveness_session.run(None, {liveness_session.get_inputs()[0].name: inp})[0].flatten()
        if len(out) >= 2:
            e = np.exp(out - out.max()); p = e / e.sum()
            spoof_score, liveness_score = float(p[0]), float(p[1])
        else:
            liveness_score = float(1.0/(1.0+math.exp(-float(out[0])))); spoof_score = 1.0-liveness_score
        is_live = liveness_score >= LIVENESS_THRESHOLD
        attack = None if is_live else ("print" if spoof_score>0.90 else "replay" if spoof_score>0.75 else "3d_mask")
        return is_live, liveness_score, attack
    else:
        # Heuristic fallback — uses scikit-image LBP (O(N) not O(h×w))
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        sharpness = min(1.0, float(cv2.Laplacian(gray, cv2.CV_64F).var()) / 500.0)
        lbp = local_binary_pattern(gray, P=8, R=1, method="uniform")
        hist, _ = np.histogram(lbp.ravel(), bins=256, range=(0,256), density=True)
        hist = hist[hist > 0]
        entropy = min(1.0, float(-np.sum(hist * np.log2(hist))) / 7.0)
        fft = np.fft.fftshift(np.fft.fft2(gray)); mag = np.abs(fft)
        hf,wf = mag.shape; cy,cx = hf//2, wf//2; r = min(hf,wf)//4
        low = mag[cy-r:cy+r, cx-r:cx+r].sum(); high = mag.sum()-low
        freq = min(1.0, float(high/(low+1e-6))/0.5)
        liveness_score = sharpness*0.35 + entropy*0.35 + freq*0.30
        is_live = liveness_score >= LIVENESS_THRESHOLD
        attack = None if is_live else ("print" if sharpness<0.3 else "replay")
        return is_live, liveness_score, attack

def _preprocess_liveness(crop: np.ndarray) -> np.ndarray:
    r = cv2.cvtColor(cv2.resize(crop,(80,80)), cv2.COLOR_BGR2RGB).astype(np.float32)/255.0
    r = (r - np.array([0.485,0.456,0.406])) / np.array([0.229,0.224,0.225])
    return r.transpose(2,0,1)[np.newaxis,...].astype(np.float32)

# ── Quality Assessment ────────────────────────────────────────────────────────
def assess_quality(img: np.ndarray, faces: List[Any]) -> QualityMetrics:
    h,w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blur = min(1.0, float(cv2.Laplacian(gray, cv2.CV_64F).var())/300.0)
    bright = max(0.0, 1.0-abs(float(gray.mean())/255.0-0.5)*2.0)
    contrast = min(1.0, float(gray.std())/128.0)
    yaw=pitch=roll=0.0; res_ok=False; fsr=0.0
    if faces:
        best = max(faces, key=lambda f: _bbox_area(f.bbox))
        x1,y1,x2,y2 = best.bbox; fw,fh = float(x2-x1), float(y2-y1)
        res_ok = fw>=100 and fh>=100; fsr = float((fw*fh)/(w*h+1e-6))
        if hasattr(best,"pose") and best.pose is not None and len(best.pose)>=3:
            pitch,yaw,roll = float(best.pose[0]),float(best.pose[1]),float(best.pose[2])
    pose_pen = max(0.0, 1.0-(abs(yaw)+abs(pitch))/60.0)
    overall = blur*0.25+bright*0.15+contrast*0.15+pose_pen*0.25+(1.0 if res_ok else 0.0)*0.10+min(1.0,fsr*10.0)*0.10
    return QualityMetrics(blur_score=round(blur,4),brightness_score=round(bright,4),contrast_score=round(contrast,4),
        pose_yaw=round(yaw,2),pose_pitch=round(pitch,2),pose_roll=round(roll,2),
        resolution_ok=res_ok,face_size_ratio=round(fsr,4),overall_score=round(overall,4))

# ── Qdrant Helpers ────────────────────────────────────────────────────────────
def _sid_to_uuid(sid: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, sid))

def qdrant_upsert(subject_id: str, emb: np.ndarray, payload: Dict) -> bool:
    if qdrant_client is None: return False
    try:
        from qdrant_client.models import PointStruct
        qdrant_client.upsert(collection_name=QDRANT_COLLECTION,
            points=[PointStruct(id=_sid_to_uuid(subject_id), vector=emb.tolist(),
                payload={**payload, "subject_id": subject_id})])
        return True
    except Exception as e:
        logger.error(f"qdrant_upsert_failed: {e}"); return False

def qdrant_search(emb: np.ndarray, top_k: int, score_threshold: float) -> List[FaceIdentifyMatch]:
    if qdrant_client is None: return []
    try:
        from qdrant_client.models import SearchParams
        results = qdrant_client.search(collection_name=QDRANT_COLLECTION,
            query_vector=emb.tolist(), limit=top_k,
            score_threshold=1.0-score_threshold,
            search_params=SearchParams(hnsw_ef=128, exact=False), with_payload=True)
        return [FaceIdentifyMatch(
            subject_id=r.payload.get("subject_id", str(r.id)),
            similarity=round(float(r.score),6), distance=round(float(1.0-r.score),6),
            verified=(1.0-r.score)<=score_threshold) for r in results]
    except Exception as e:
        logger.error(f"qdrant_search_failed: {e}"); return []

# ── JWT Signed Assertion ──────────────────────────────────────────────────────
def issue_assertion(subject_id: str, similarity: float, liveness_passed: Optional[bool]) -> Optional[str]:
    if jwt_private_key is None: return None
    try:
        import jwt as pyjwt
        now = datetime.now(timezone.utc)
        payload = {"iss": JWT_ISSUER, "sub": subject_id,
            "iat": int(now.timestamp()), "exp": int((now+timedelta(seconds=JWT_ASSERTION_TTL_SEC)).timestamp()),
            "jti": str(uuid.uuid4()), "face_similarity": round(similarity,4),
            "liveness_passed": liveness_passed, "assertion_type": "face_verification"}
        return pyjwt.encode(payload, jwt_private_key, algorithm="RS256")
    except Exception as e:
        logger.error(f"jwt_issue_failed: {e}"); return None

# ── Name Matching ─────────────────────────────────────────────────────────────
def _jaro_winkler(s1: str, s2: str) -> float:
    try:
        import jellyfish
        if not s1 and not s2: return 1.0
        if not s1 or not s2: return 0.0
        return float(jellyfish.jaro_winkler_similarity(s1.lower().strip(), s2.lower().strip()))
    except Exception: return 0.0

def compute_name_match_score(ef,el,af,al,efull=None,afull=None):
    try: import jellyfish
    except ImportError: return 0.0,None,None,None
    scores=[]; fs=ls=fls=None
    if efull and afull:
        fls=_jaro_winkler(efull,afull)
        try:
            if jellyfish.soundex(efull.split()[0])==jellyfish.soundex(afull.split()[0]) and fls<0.85: fls=max(fls,0.75)
        except Exception: pass
        scores.append((fls,1.0))
    if ef and af:
        fs=_jaro_winkler(ef,af)
        try:
            if jellyfish.soundex(ef)==jellyfish.soundex(af) and fs<0.85: fs=max(fs,0.75)
        except Exception: pass
        scores.append((fs,0.40))
    if el and al:
        ls=_jaro_winkler(el,al)
        try:
            if jellyfish.soundex(el)==jellyfish.soundex(al) and ls<0.85: ls=max(ls,0.75)
        except Exception: pass
        scores.append((ls,0.60))
    if not scores: return 0.0,fs,ls,fls
    tw=sum(w for _,w in scores)
    return round(sum(s*w for s,w in scores)/tw,4),fs,ls,fls

# ── Kafka Helper ──────────────────────────────────────────────────────────────
async def publish_event(topic: str, key: str, data: dict):
    if kafka_producer is None: return
    try: await kafka_producer.send_and_wait(topic, key=key.encode(), value=json.dumps(data).encode())
    except Exception as e: logger.warning(f"kafka_publish_failed topic={topic}: {e}")

# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.post("/v1/face/verify", response_model=FaceVerifyResult)
async def verify_face(req: FaceVerifyRequest, bg: BackgroundTasks):
    t0=time.monotonic(); h_probe=image_hash(req.probe_image_b64)
    if redis_client:
        h_ref=image_hash(req.reference_image_b64); ck=f"verify:{h_probe}:{h_ref}"
        cached=await redis_client.get(ck)
        if cached: r=FaceVerifyResult(**json.loads(cached)); r.cached=True; return r
    img_p=decode_image(req.probe_image_b64); img_r=decode_image(req.reference_image_b64)
    fp=detect_faces(img_p); fr=detect_faces(img_r)
    lp=ls=None
    if req.require_liveness:
        live,lscore,_=run_liveness(img_p,fp); lp=live; ls=round(lscore,4)
        if not live:
            r=FaceVerifyResult(verified=False,similarity=0.0,distance=1.0,threshold=FACE_VERIFY_THRESHOLD,
                liveness_passed=False,liveness_score=ls,face_count_probe=len(fp),face_count_ref=len(fr),
                subject_id=req.subject_id,image_hash_probe=h_probe,verified_at=datetime.now(timezone.utc).isoformat(),
                processing_ms=round((time.monotonic()-t0)*1000,2))
            bg.add_task(publish_event,TOPIC_FACE_VERIFY,req.subject_id or "anon",r.model_dump()); return r
    qp=qm=None
    if req.require_quality:
        qmet=assess_quality(img_p,fp); qp=qmet.overall_score>=req.min_quality_score; qm=qmet
    ep=get_embedding(fp); er=get_embedding(fr)
    if ep is None or er is None: raise HTTPException(422,"Could not extract face embedding")
    sim=cosine_similarity(ep,er); dist=cosine_distance(ep,er); verified=dist<=FACE_VERIFY_THRESHOLD
    aj=issue_assertion(req.subject_id,sim,lp) if (req.issue_assertion and verified and req.subject_id) else None
    r=FaceVerifyResult(verified=verified,similarity=round(sim,6),distance=round(dist,6),threshold=FACE_VERIFY_THRESHOLD,
        liveness_passed=lp,liveness_score=ls,quality_passed=qp,quality_metrics=qm,
        face_count_probe=len(fp),face_count_ref=len(fr),subject_id=req.subject_id,
        image_hash_probe=h_probe,verified_at=datetime.now(timezone.utc).isoformat(),
        processing_ms=round((time.monotonic()-t0)*1000,2),assertion_jwt=aj)
    if redis_client:
        h_ref=image_hash(req.reference_image_b64)
        await redis_client.setex(f"verify:{h_probe}:{h_ref}",CACHE_TTL_SECONDS,json.dumps(r.model_dump()))
    bg.add_task(publish_event,TOPIC_FACE_VERIFY,req.subject_id or "anon",r.model_dump())
    logger.info(f"face_verify subject={req.subject_id} verified={verified} dist={dist:.4f}"); return r

@app.post("/v1/face/liveness", response_model=FaceLivenessResult)
async def check_liveness(req: FaceLivenessRequest, bg: BackgroundTasks):
    t0=time.monotonic(); h=image_hash(req.image_b64)
    if redis_client:
        cached=await redis_client.get(f"liveness:{h}")
        if cached: r=FaceLivenessResult(**json.loads(cached)); r.cached=True; return r
    img=decode_image(req.image_b64); faces=detect_faces(img)
    live,lscore,attack=run_liveness(img,faces)
    r=FaceLivenessResult(is_live=live,spoof_score=round(1.0-lscore,4),liveness_score=round(lscore,4),
        attack_type=attack,face_detected=len(faces)>0,subject_id=req.subject_id,
        image_hash=h,checked_at=datetime.now(timezone.utc).isoformat(),
        processing_ms=round((time.monotonic()-t0)*1000,2))
    if redis_client: await redis_client.setex(f"liveness:{h}",CACHE_TTL_SECONDS,json.dumps(r.model_dump()))
    bg.add_task(publish_event,TOPIC_FACE_LIVENESS,req.subject_id or "anon",r.model_dump()); return r

@app.post("/v1/face/quality", response_model=FaceQualityResult)
async def assess_face_quality(req: FaceQualityRequest):
    t0=time.monotonic(); img=decode_image(req.image_b64); faces=detect_faces(img)
    qm=assess_quality(img,faces)
    return FaceQualityResult(quality_passed=qm.overall_score>=QUALITY_MIN_SCORE,
        quality_score=qm.overall_score,metrics=qm,subject_id=req.subject_id,
        processing_ms=round((time.monotonic()-t0)*1000,2))

@app.post("/v1/face/enroll", response_model=FaceEnrollResult)
async def enroll_face(req: FaceEnrollRequest, bg: BackgroundTasks):
    t0=time.monotonic(); img=decode_image(req.image_b64); faces=detect_faces(img)
    lp=None
    if req.require_liveness:
        live,_,_=run_liveness(img,faces); lp=live
        if not live: raise HTTPException(422,"Liveness check failed — enrollment rejected")
    qp=None
    if req.require_quality:
        qm=assess_quality(img,faces); qp=qm.overall_score>=QUALITY_MIN_SCORE
        if not qp: raise HTTPException(422,f"Quality check failed (score={qm.overall_score:.2f})")
    emb=get_embedding(faces)
    if emb is None: raise HTTPException(422,"Could not extract face embedding")
    qdrant_upsert(req.subject_id,emb,{"tenant_id":req.tenant_id,"enrolled_at":datetime.now(timezone.utc).isoformat()})
    if redis_client:
        await redis_client.setex(f"face:emb:{req.subject_id}",CACHE_TTL_SECONDS*30,json.dumps(emb.tolist()))
    r=FaceEnrollResult(enrolled=True,subject_id=req.subject_id,embedding_dim=len(emb),
        liveness_passed=lp,quality_passed=qp,enrolled_at=datetime.now(timezone.utc).isoformat(),
        processing_ms=round((time.monotonic()-t0)*1000,2))
    bg.add_task(publish_event,TOPIC_FACE_ENROLL,req.subject_id,r.model_dump())
    logger.info(f"face_enroll subject={req.subject_id} dim={len(emb)}"); return r

@app.post("/v1/face/identify", response_model=FaceIdentifyResult)
async def identify_face(req: FaceIdentifyRequest, bg: BackgroundTasks):
    """1:N identification via Qdrant HNSW ANN — O(log N) at scale."""
    t0=time.monotonic(); img=decode_image(req.probe_image_b64); faces=detect_faces(img)
    if not faces: return FaceIdentifyResult(identified=False,processing_ms=round((time.monotonic()-t0)*1000,2))
    pl=None
    if req.require_liveness:
        live,_,_=run_liveness(img,faces); pl=live
        if not live: return FaceIdentifyResult(identified=False,probe_liveness=False,processing_ms=round((time.monotonic()-t0)*1000,2))
    emb=get_embedding(faces)
    if emb is None: return FaceIdentifyResult(identified=False,probe_liveness=pl,processing_ms=round((time.monotonic()-t0)*1000,2))
    matches=qdrant_search(emb,top_k=req.top_k,score_threshold=req.score_threshold)
    identified=bool(matches and matches[0].verified)
    r=FaceIdentifyResult(identified=identified,top_match_id=matches[0].subject_id if matches else None,
        top_similarity=matches[0].similarity if matches else 0.0,matches=matches,
        probe_liveness=pl,processing_ms=round((time.monotonic()-t0)*1000,2))
    bg.add_task(publish_event,TOPIC_FACE_IDENTIFY,"identify",r.model_dump()); return r

@app.post("/v1/face/batch-identify", response_model=FaceBatchIdentifyResult)
async def batch_identify_faces(req: FaceBatchIdentifyRequest, bg: BackgroundTasks):
    """Batch 1:N identification — multiple probe images in one request."""
    t0=time.monotonic(); results=[]
    for probe_req in req.probes:
        try: results.append(await identify_face(probe_req, bg))
        except HTTPException: results.append(FaceIdentifyResult(identified=False,processing_ms=0.0))
    identified_count=sum(1 for r in results if r.identified)
    br=FaceBatchIdentifyResult(results=results,total_probes=len(results),
        identified_count=identified_count,processing_ms=round((time.monotonic()-t0)*1000,2))
    bg.add_task(publish_event,TOPIC_FACE_BATCH,"batch",br.model_dump())
    logger.info(f"face_batch total={len(results)} identified={identified_count}"); return br

@app.post("/v1/name/match", response_model=NameMatchResult)
async def match_name(req: NameMatchRequest):
    overall,fs,ls,fls=compute_name_match_score(req.expected_first,req.expected_last,
        req.actual_first,req.actual_last,req.expected_full,req.actual_full)
    return NameMatchResult(match_score=overall,first_name_score=fs,last_name_score=ls,full_name_score=fls,matched=overall>=0.70)

@app.get("/v1/face/public-key")
async def get_public_key():
    if jwt_public_key is None: raise HTTPException(503,"JWT public key not loaded")
    return {"public_key":jwt_public_key.decode("utf-8"),"algorithm":"RS256"}

@app.get("/health")
async def health():
    qdrant_ok=False
    if qdrant_client:
        try: qdrant_client.get_collection(QDRANT_COLLECTION); qdrant_ok=True
        except Exception: pass
    return {"status":"ok","service":"face-biometric","version":"2.0.0",
        "insightface_loaded":face_app is not None,
        "liveness_model_loaded":liveness_session is not None,
        "liveness_mode":"onnx" if liveness_session is not None else "heuristic",
        "qdrant_connected":qdrant_ok,"redis_connected":redis_client is not None,
        "kafka_connected":kafka_producer is not None,"jwt_keys_loaded":jwt_private_key is not None,
        "gpu_available":"CUDAExecutionProvider" in _get_onnx_providers()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app",host="0.0.0.0",port=int(os.getenv("PORT","8220")),workers=int(os.getenv("WORKERS","2")),log_config=None)
