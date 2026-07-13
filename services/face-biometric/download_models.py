"""
download_models.py — Download Silent-Face Anti-Spoofing ONNX model.

Run this script once during Docker build or first startup to download the
Silent-Face Anti-Spoofing model weights.

The model is a lightweight (~1.5 MB) ONNX model trained on the CASIA-SURF
dataset for passive liveness detection.

Usage:
    python3 download_models.py
"""
import os
import hashlib
import urllib.request

MODELS_DIR = os.getenv("MODELS_DIR", "/app/models")

# Silent-Face Anti-Spoofing ONNX model
# Source: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing
# Converted to ONNX from the original PyTorch checkpoint.
SILENT_FACE_MODEL_URL = (
    "https://github.com/minivision-ai/Silent-Face-Anti-Spoofing"
    "/raw/master/resources/anti_spoof_models/2.7_80x80_MiniFASNetV2.onnx"
)
SILENT_FACE_MODEL_FILENAME = "silent_face_anti_spoof.onnx"
# SHA-256 of the expected model file (for integrity verification)
SILENT_FACE_MODEL_SHA256 = None  # Set to actual hash after first download


def download_file(url: str, dest: str):
    print(f"Downloading {url} -> {dest}")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    urllib.request.urlretrieve(url, dest)
    print(f"Downloaded: {os.path.getsize(dest)} bytes")


def verify_sha256(path: str, expected: str) -> bool:
    sha256 = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            sha256.update(chunk)
    actual = sha256.hexdigest()
    if actual != expected:
        print(f"SHA-256 mismatch: expected={expected} actual={actual}")
        return False
    return True


def main():
    os.makedirs(MODELS_DIR, exist_ok=True)
    model_path = os.path.join(MODELS_DIR, SILENT_FACE_MODEL_FILENAME)

    if os.path.exists(model_path):
        print(f"Model already exists: {model_path}")
        return

    try:
        download_file(SILENT_FACE_MODEL_URL, model_path)
        if SILENT_FACE_MODEL_SHA256:
            if not verify_sha256(model_path, SILENT_FACE_MODEL_SHA256):
                os.remove(model_path)
                raise ValueError("Model integrity check failed")
        print(f"Model ready: {model_path}")
    except Exception as e:
        print(f"WARNING: Could not download liveness model: {e}")
        print("Service will use heuristic liveness fallback.")


if __name__ == "__main__":
    main()
