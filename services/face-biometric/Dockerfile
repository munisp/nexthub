# ── Build Args ────────────────────────────────────────────────────────────────
ARG USE_GPU=false

# ── Base: CPU ─────────────────────────────────────────────────────────────────
FROM python:3.12-slim-bookworm AS base-cpu
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

# ── Base: GPU ─────────────────────────────────────────────────────────────────
FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04 AS base-gpu
RUN apt-get update && apt-get install -y --no-install-recommends python3.12 python3-pip \
    && rm -rf /var/lib/apt/lists/*
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

# ── Select base ───────────────────────────────────────────────────────────────
FROM base-${USE_GPU:-cpu} AS final

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 libsm6 libxrender1 libxext6 libgl1 \
    libgomp1 wget curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Swap onnxruntime for GPU variant if USE_GPU=true
ARG USE_GPU=false
RUN if [ "$USE_GPU" = "true" ]; then \
      pip3 uninstall -y onnxruntime && pip3 install --no-cache-dir onnxruntime-gpu==1.18.0; \
    fi

# ── Download ONNX liveness model at build time ────────────────────────────────
RUN mkdir -p /app/models
RUN wget -q -O /app/models/silent_face_anti_spoof.onnx \
    "https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/raw/master/resources/anti_spoof_models/2.7_80x80_MiniFASNetV2.onnx" \
    || echo "WARNING: liveness model download failed — heuristic fallback will be used"

# ── Generate RS256 JWT key pair at build time ─────────────────────────────────
RUN python3 -c "
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
with open('/app/models/jwt_private.pem','wb') as f:
    f.write(key.private_bytes(serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption()))
with open('/app/models/jwt_public.pem','wb') as f:
    f.write(key.public_key().public_bytes(serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo))
print('JWT keys generated')
"

# Copy service code
COPY main.py .

EXPOSE 8220
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -sf http://localhost:8220/health || exit 1

CMD ["python3", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8220", "--workers", "2"]
