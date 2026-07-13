# face-biometric — NextHub Next-Generation Face Biometric Service

A production-grade Python (FastAPI) microservice providing next-generation
face biometric capabilities for the NextHub national identity platform.

## Capabilities

| Capability | Technology | Standard |
|---|---|---|
| Face Detection | InsightFace RetinaFace | ISO/IEC 19794-5 |
| Face Recognition | InsightFace ArcFace (`buffalo_l`, 512-d) | ISO/IEC 19794-5 |
| Passive Liveness | Silent-Face Anti-Spoofing (ONNX) | ISO 30107-3 PAD Level 1 |
| Quality Assessment | Blur, brightness, contrast, pose, resolution | ISO/IEC 29794-1 |
| Name Matching | Jaro-Winkler + Soundex phonetic boost | — |
| 1:N Identification | ArcFace cosine similarity against enrolled set | — |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/v1/face/verify` | 1:1 face verification (probe vs reference) |
| `POST` | `/v1/face/liveness` | Passive liveness / anti-spoofing check |
| `POST` | `/v1/face/quality` | ISO 19794-5 quality assessment |
| `POST` | `/v1/face/enroll` | Extract and store face embedding |
| `POST` | `/v1/face/identify` | 1:N identification against enrolled set |
| `POST` | `/v1/name/match` | Jaro-Winkler name match score |
| `GET` | `/health` | Health check |

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `REDIS_URL` | `redis://redis:6379` | Redis connection URL |
| `KAFKA_BROKERS` | `kafka:9092` | Kafka broker addresses |
| `INSIGHTFACE_MODEL` | `buffalo_l` | InsightFace model pack name |
| `FACE_VERIFY_THRESHOLD` | `0.40` | Cosine distance threshold for match |
| `LIVENESS_THRESHOLD` | `0.60` | Minimum liveness score to pass |
| `QUALITY_MIN_SCORE` | `0.50` | Minimum quality score to pass |
| `LIVENESS_MODEL_PATH` | `/app/models/silent_face_anti_spoof.onnx` | Path to ONNX liveness model |
| `PORT` | `8220` | Service port |

## Liveness Model

The service uses the **Silent-Face Anti-Spoofing** ONNX model (MiniFASNetV2,
80×80 input). Download it before deployment:

```bash
python3 download_models.py
```

If the model is not present, the service falls back to a heuristic liveness
check based on Laplacian variance, LBP texture entropy, and frequency-domain
analysis. This is not production-grade but prevents the service from failing.

## Face Verification Threshold

The default cosine distance threshold of **0.40** corresponds to approximately
99.5% TAR at 0.1% FAR on the LFW benchmark using the ArcFace buffalo_l model.
Adjust `FACE_VERIFY_THRESHOLD` based on your security requirements:

| Threshold | Security Level | Use Case |
|---|---|---|
| 0.30 | Very High | High-security enrollment |
| 0.40 | High (default) | National ID issuance |
| 0.50 | Medium | General authentication |
| 0.60 | Low | Convenience unlock |

## Kafka Topics

| Topic | Event |
|---|---|
| `nexthub.face.verify.result.v1` | Successful face verification |
| `nexthub.face.liveness.result.v1` | Liveness check result |
| `nexthub.face.enroll.result.v1` | Face enrollment |
| `nexthub.face.identify.result.v1` | 1:N identification result |
| `nexthub.face.failed.v1` | Failed verification / liveness / quality |
