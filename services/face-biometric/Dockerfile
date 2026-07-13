# ── Face Biometric Service Dockerfile ────────────────────────────────────────
# Supports both CPU-only and GPU (CUDA 12) builds.
# Build args:
#   USE_GPU=0  (default) — CPU-only, uses onnxruntime
#   USE_GPU=1            — GPU build, replaces onnxruntime with onnxruntime-gpu
#
# CPU build:
#   docker build -t nexthub/face-biometric:latest .
# GPU build:
#   docker build --build-arg USE_GPU=1 -t nexthub/face-biometric:gpu .
# ─────────────────────────────────────────────────────────────────────────────

ARG USE_GPU=0

FROM python:3.12-slim

# ── System dependencies ───────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libgl1-mesa-glx \
    curl \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Python dependencies ───────────────────────────────────────────────────────
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# If GPU build: replace onnxruntime with onnxruntime-gpu
ARG USE_GPU
RUN if [ "${USE_GPU}" = "1" ]; then \
      pip install --no-cache-dir \
        onnxruntime-gpu==1.18.1 \
        --extra-index-url https://aiinfra.pkgs.visualstudio.com/PublicPackages/_packaging/onnxruntime-cuda-12/pypi/simple/; \
    fi

# ── Pre-download InsightFace buffalo_l model ──────────────────────────────────
# Downloads ~300 MB of ArcFace R100 weights at build time to avoid cold-start.
RUN python3 -c "\
import insightface; \
from insightface.app import FaceAnalysis; \
fa = FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider']); \
fa.prepare(ctx_id=-1, det_size=(640, 640)); \
print('buffalo_l model downloaded successfully')" \
    || echo "WARNING: buffalo_l model download failed — will retry at runtime"

# ── Download Silent-Face Anti-Spoofing ONNX model ─────────────────────────────
# CRITICAL: This is the production liveness model. Without it, the service
# falls back to a heuristic that cannot detect high-quality spoofing attacks.
# Source: minivision-ai/Silent-Face-Anti-Spoofing (CASIA-SURF trained)
RUN mkdir -p /app/models && \
    wget -q --tries=3 --timeout=60 \
      "https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/raw/master/resources/anti_spoof_models/2.7_80x80_MiniFASNetV2.onnx" \
      -O /app/models/silent_face_anti_spoof.onnx && \
    echo "Liveness model size: $(wc -c < /app/models/silent_face_anti_spoof.onnx) bytes" && \
    python3 -c "import onnxruntime; s=onnxruntime.InferenceSession('/app/models/silent_face_anti_spoof.onnx'); print('Liveness ONNX model verified OK')" \
    || (echo "WARNING: Liveness model download/verify failed — heuristic fallback will be used" && rm -f /app/models/silent_face_anti_spoof.onnx)

# ── Generate RS256 key pair for signed payment assertions ─────────────────────
# In production, replace these with secrets injected at runtime via env vars
# or a secrets manager (Vault, AWS Secrets Manager, etc.).
# Override by mounting /app/models/jwt_private.pem and /app/models/jwt_public.pem
RUN python3 -c "\
from cryptography.hazmat.primitives.asymmetric import rsa; \
from cryptography.hazmat.primitives import serialization; \
key = rsa.generate_private_key(public_exponent=65537, key_size=2048); \
priv = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL, serialization.NoEncryption()); \
pub  = key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo); \
open('/app/models/jwt_private.pem','wb').write(priv); \
open('/app/models/jwt_public.pem','wb').write(pub); \
print('RS256 key pair generated at /app/models/jwt_private.pem')"

# ── Copy application code ─────────────────────────────────────────────────────
COPY . .

EXPOSE 8220

HEALTHCHECK --interval=15s --timeout=10s --retries=5 \
    CMD curl -sf http://localhost:8220/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8220", "--workers", "2"]
