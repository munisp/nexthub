FROM python:3.12-slim

# System dependencies for OpenCV and InsightFace
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libgl1-mesa-glx \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (layer cache)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download InsightFace buffalo_l model during build
# (avoids cold-start delay in production)
RUN python3 -c "\
import insightface; \
from insightface.app import FaceAnalysis; \
fa = FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider']); \
fa.prepare(ctx_id=-1, det_size=(640, 640)); \
print('buffalo_l model downloaded')" || echo "Model download deferred to runtime"

# Copy application code
COPY . .

# Create models directory for liveness ONNX weights
RUN mkdir -p /app/models

EXPOSE 8220

HEALTHCHECK --interval=15s --timeout=10s --retries=5 \
    CMD curl -sf http://localhost:8220/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8220", "--workers", "2"]
