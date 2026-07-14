"""
NextHub Platform — Comprehensive Smoke Test Suite
==================================================
Covers every stakeholder workflow across all services:
  - Hub Operator
  - DFSP / Financial Institution
  - Regulator / Supervisor
  - Citizen (MOSIP + NINAuth)
  - Partner / Third-Party App
  - Developer (API key management)
  - Compliance / Audit Officer

Services tested:
  - Go Bridge (port 8200)
  - Python Face Biometric (port 8220)
  - Rust Face Bias Audit (port 8230)
  - Qdrant Vector DB (port 6333)

Usage:
    python3 tests/python/smoke_test_all_workflows.py [--bridge-url http://localhost:8200]
"""

import sys
import json
import base64
import hashlib
import time
import argparse
import io
import os
from dataclasses import dataclass, field
from typing import Any, Optional

try:
    import requests
    import numpy as np
    from PIL import Image, ImageDraw
except ImportError:
    print("Installing test dependencies...")
    os.system("pip3 install requests numpy pillow -q")
    import requests
    import numpy as np
    from PIL import Image, ImageDraw

# ─── Configuration ────────────────────────────────────────────────────────────
BRIDGE_URL       = os.environ.get("BRIDGE_URL",        "http://localhost:8200")
FACE_BIO_URL     = os.environ.get("FACE_BIOMETRIC_URL","http://localhost:8220")
BIAS_AUDIT_URL   = os.environ.get("BIAS_AUDIT_URL",    "http://localhost:8230")
QDRANT_URL       = os.environ.get("QDRANT_URL",        "http://localhost:6333")
INTERNAL_KEY     = os.environ.get("MIDDLEWARE_INTERNAL_KEY", "nexthub-internal-key")
PARTNER_API_KEY  = os.environ.get("TEST_PARTNER_API_KEY", "")

HEADERS_INTERNAL = {"X-Internal-Key": INTERNAL_KEY, "Content-Type": "application/json"}
HEADERS_PARTNER  = {"X-API-Key": PARTNER_API_KEY, "Content-Type": "application/json"} if PARTNER_API_KEY else {}

# ─── Test Result Tracking ─────────────────────────────────────────────────────
@dataclass
class TestResult:
    name: str
    passed: bool
    message: str
    duration_ms: float
    stakeholder: str
    service: str

results: list[TestResult] = []

def run_test(name: str, stakeholder: str, service: str, fn) -> TestResult:
    start = time.time()
    try:
        fn()
        duration = (time.time() - start) * 1000
        r = TestResult(name, True, "PASS", duration, stakeholder, service)
        print(f"  ✅ [{stakeholder}] {name} ({duration:.0f}ms)")
    except AssertionError as e:
        duration = (time.time() - start) * 1000
        r = TestResult(name, False, str(e), duration, stakeholder, service)
        print(f"  ❌ [{stakeholder}] {name}: {e}")
    except Exception as e:
        duration = (time.time() - start) * 1000
        r = TestResult(name, False, f"ERROR: {e}", duration, stakeholder, service)
        print(f"  💥 [{stakeholder}] {name}: {e}")
    results.append(r)
    return r

# ─── Helper: Generate synthetic face image ────────────────────────────────────
def make_face_image_b64(width=640, height=640, skin_tone=(210, 180, 140)) -> str:
    """Generate a synthetic ICAO-compliant face image for testing."""
    img = Image.new("RGB", (width, height), color=(240, 240, 240))
    draw = ImageDraw.Draw(img)
    # Face oval
    draw.ellipse([160, 80, 480, 560], fill=skin_tone, outline=(100, 80, 60), width=3)
    # Eyes
    draw.ellipse([220, 220, 280, 260], fill=(50, 30, 20))
    draw.ellipse([360, 220, 420, 260], fill=(50, 30, 20))
    # Nose
    draw.polygon([(320, 280), (300, 360), (340, 360)], fill=(180, 140, 110))
    # Mouth
    draw.arc([270, 380, 370, 440], start=0, end=180, fill=(150, 80, 80), width=4)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)
    return base64.b64encode(buf.getvalue()).decode()

def make_face_payload(subject_id: str = "TEST-001") -> dict:
    return {
        "subject_id": subject_id,
        "image_b64": make_face_image_b64(),
        "context": "test",
    }

# ─── SERVICE HEALTH CHECKS ────────────────────────────────────────────────────
def test_section(title: str):
    print(f"\n{'═'*60}")
    print(f"  {title}")
    print(f"{'═'*60}")

test_section("1. SERVICE HEALTH CHECKS")

def _bridge_health():
    r = requests.get(f"{BRIDGE_URL}/health", timeout=5)
    assert r.status_code == 200, f"Bridge health returned {r.status_code}"

def _face_bio_health():
    r = requests.get(f"{FACE_BIO_URL}/health", timeout=5)
    assert r.status_code == 200, f"Face-biometric health returned {r.status_code}"
    data = r.json()
    assert data.get("status") == "healthy", f"Face-biometric not healthy: {data}"

def _qdrant_health():
    r = requests.get(f"{QDRANT_URL}/healthz", timeout=5)
    assert r.status_code == 200, f"Qdrant health returned {r.status_code}"

def _bias_audit_health():
    r = requests.get(f"{BIAS_AUDIT_URL}/health", timeout=5)
    assert r.status_code == 200, f"Bias-audit health returned {r.status_code}"

run_test("Bridge service health", "Platform", "bridge", _bridge_health)
run_test("Face-biometric service health", "Platform", "face-biometric", _face_bio_health)
run_test("Qdrant vector DB health", "Platform", "qdrant", _qdrant_health)
run_test("Face-bias-audit service health", "Platform", "face-bias-audit", _bias_audit_health)

# ─── STAKEHOLDER: CITIZEN — MOSIP REGISTRATION ────────────────────────────────
test_section("2. CITIZEN — MOSIP REGISTRATION WORKFLOWS")

def _mosip_pre_register():
    payload = {
        "full_name": "Aminu Bello",
        "date_of_birth": "1990-05-15",
        "gender": "MALE",
        "phone": "+2348012345678",
        "email": "aminu.bello@test.com",
        "address": "12 Ahmadu Bello Way, Abuja",
        "language": "eng",
    }
    r = requests.post(f"{BRIDGE_URL}/v1/mosip/pre-register", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 201, 202, 503), f"MOSIP pre-register returned {r.status_code}: {r.text[:200]}"

def _mosip_upload_packet():
    payload = {
        "pre_registration_id": "TEST-PREREG-001",
        "registration_center_id": "RC001",
        "machine_id": "MACHINE001",
        "packet_b64": base64.b64encode(b"fake-encrypted-packet-data").decode(),
        "packet_hash": hashlib.sha256(b"fake-encrypted-packet-data").hexdigest(),
    }
    r = requests.post(f"{BRIDGE_URL}/v1/mosip/upload-packet", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 201, 202, 503), f"MOSIP upload-packet returned {r.status_code}: {r.text[:200]}"

def _mosip_check_status():
    r = requests.get(f"{BRIDGE_URL}/v1/mosip/registration-status?rid=TEST-RID-001", headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 404, 503), f"MOSIP status check returned {r.status_code}: {r.text[:200]}"

def _mosip_generate_vid():
    payload = {"uin": "TEST-UIN-001", "vid_type": "PERPETUAL"}
    r = requests.post(f"{BRIDGE_URL}/v1/mosip/generate-vid", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 201, 202, 503), f"MOSIP generate-VID returned {r.status_code}: {r.text[:200]}"

def _mosip_verify_identity():
    payload = {
        "individual_id": "TEST-VID-001",
        "individual_id_type": "VID",
        "otp": "123456",
        "transaction_id": "TXN-TEST-001",
    }
    r = requests.post(f"{BRIDGE_URL}/v1/mosip/verify-identity", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 401, 503), f"MOSIP verify-identity returned {r.status_code}: {r.text[:200]}"

run_test("MOSIP pre-registration", "Citizen", "bridge/mosip", _mosip_pre_register)
run_test("MOSIP packet upload", "Citizen", "bridge/mosip", _mosip_upload_packet)
run_test("MOSIP registration status check", "Citizen", "bridge/mosip", _mosip_check_status)
run_test("MOSIP VID generation", "Citizen", "bridge/mosip", _mosip_generate_vid)
run_test("MOSIP identity verification", "Citizen", "bridge/mosip", _mosip_verify_identity)

# ─── STAKEHOLDER: CITIZEN — FACE BIOMETRIC WORKFLOWS ─────────────────────────
test_section("3. CITIZEN — FACE BIOMETRIC WORKFLOWS")

TEST_SUBJECT_ID = f"SMOKE-TEST-{int(time.time())}"

def _face_quality_check():
    payload = {"image_b64": make_face_image_b64()}
    r = requests.post(f"{FACE_BIO_URL}/v1/face/quality", json=payload, timeout=30)
    assert r.status_code == 200, f"Face quality check returned {r.status_code}: {r.text[:200]}"
    data = r.json()
    assert "overall_score" in data, f"Missing overall_score in response: {data}"
    assert "icao_compliant" in data, f"Missing icao_compliant in response: {data}"
    assert "guidance" in data, f"Missing guidance in response: {data}"

def _face_enroll():
    payload = {
        "subject_id": TEST_SUBJECT_ID,
        "image_b64": make_face_image_b64(),
        "metadata": {"test": True, "stakeholder": "citizen"},
    }
    r = requests.post(f"{FACE_BIO_URL}/v1/face/enroll", json=payload, timeout=30)
    assert r.status_code in (200, 201), f"Face enroll returned {r.status_code}: {r.text[:200]}"
    data = r.json()
    assert "enrolled" in data or "subject_id" in data, f"Unexpected enroll response: {data}"

def _face_verify():
    payload = {
        "subject_id": TEST_SUBJECT_ID,
        "image_b64": make_face_image_b64(),
        "check_liveness": True,
    }
    r = requests.post(f"{FACE_BIO_URL}/v1/face/verify", json=payload, timeout=30)
    assert r.status_code in (200, 404), f"Face verify returned {r.status_code}: {r.text[:200]}"
    if r.status_code == 200:
        data = r.json()
        assert "verified" in data, f"Missing 'verified' in response: {data}"
        assert "similarity" in data, f"Missing 'similarity' in response: {data}"
        assert "liveness" in data, f"Missing 'liveness' in response: {data}"

def _face_liveness():
    payload = {"image_b64": make_face_image_b64()}
    r = requests.post(f"{FACE_BIO_URL}/v1/face/liveness", json=payload, timeout=30)
    assert r.status_code == 200, f"Face liveness returned {r.status_code}: {r.text[:200]}"
    data = r.json()
    assert "is_live" in data, f"Missing 'is_live' in response: {data}"
    assert "score" in data, f"Missing 'score' in response: {data}"

def _face_identify():
    payload = {
        "image_b64": make_face_image_b64(),
        "top_k": 5,
        "score_threshold": 0.5,
    }
    r = requests.post(f"{FACE_BIO_URL}/v1/face/identify", json=payload, timeout=30)
    assert r.status_code == 200, f"Face identify returned {r.status_code}: {r.text[:200]}"
    data = r.json()
    assert "identified" in data, f"Missing 'identified' in response: {data}"
    assert "candidates" in data, f"Missing 'candidates' in response: {data}"

def _face_attributes():
    payload = {"image_b64": make_face_image_b64()}
    r = requests.post(f"{FACE_BIO_URL}/v1/face/attributes", json=payload, timeout=30)
    assert r.status_code == 200, f"Face attributes returned {r.status_code}: {r.text[:200]}"
    data = r.json()
    assert "age" in data, f"Missing 'age' in response: {data}"
    assert "gender" in data, f"Missing 'gender' in response: {data}"

def _face_deepfake_detect():
    payload = {"image_b64": make_face_image_b64()}
    r = requests.post(f"{FACE_BIO_URL}/v1/face/deepfake-detect", json=payload, timeout=30)
    assert r.status_code == 200, f"Deepfake detect returned {r.status_code}: {r.text[:200]}"
    data = r.json()
    assert "is_deepfake" in data, f"Missing 'is_deepfake' in response: {data}"
    assert "confidence" in data, f"Missing 'confidence' in response: {data}"

def _face_batch_identify():
    payload = {
        "images": [
            {"image_b64": make_face_image_b64(), "ref_id": "img-001"},
            {"image_b64": make_face_image_b64(), "ref_id": "img-002"},
        ],
        "top_k": 3,
    }
    r = requests.post(f"{FACE_BIO_URL}/v1/face/batch-identify", json=payload, timeout=60)
    assert r.status_code == 200, f"Batch identify returned {r.status_code}: {r.text[:200]}"
    data = r.json()
    assert "results" in data, f"Missing 'results' in response: {data}"
    assert len(data["results"]) == 2, f"Expected 2 results, got {len(data['results'])}"

def _face_active_liveness():
    payload = {
        "frames": [make_face_image_b64(), make_face_image_b64(), make_face_image_b64()],
        "challenge": "blink",
    }
    r = requests.post(f"{FACE_BIO_URL}/v1/face/active-liveness", json=payload, timeout=30)
    assert r.status_code == 200, f"Active liveness returned {r.status_code}: {r.text[:200]}"
    data = r.json()
    assert "passed" in data, f"Missing 'passed' in response: {data}"

def _face_video_verify():
    payload = {
        "subject_id": TEST_SUBJECT_ID,
        "frames": [make_face_image_b64() for _ in range(5)],
        "fps": 10,
    }
    r = requests.post(f"{FACE_BIO_URL}/v1/face/video-verify", json=payload, timeout=60)
    assert r.status_code in (200, 404), f"Video verify returned {r.status_code}: {r.text[:200]}"

def _fidelity_assess():
    payload = {
        "image_b64": make_face_image_b64(),
        "context": "enrollment",
    }
    r = requests.post(f"{FACE_BIO_URL}/v1/fidelity/assess", json=payload, timeout=30)
    assert r.status_code == 200, f"Fidelity assess returned {r.status_code}: {r.text[:200]}"
    data = r.json()
    assert "passed" in data, f"Missing 'passed' in response: {data}"
    assert "score" in data, f"Missing 'score' in response: {data}"
    assert "icao" in data, f"Missing 'icao' in response: {data}"

def _fidelity_enroll_gated():
    payload = {
        "subject_id": f"{TEST_SUBJECT_ID}-GATED",
        "image_b64": make_face_image_b64(),
        "metadata": {"context": "national_id_enrollment"},
    }
    r = requests.post(f"{FACE_BIO_URL}/v1/fidelity/enroll-gated", json=payload, timeout=30)
    assert r.status_code in (200, 201, 422), f"Fidelity enroll-gated returned {r.status_code}: {r.text[:200]}"

run_test("Face quality check (ICAO/ISO)", "Citizen", "face-biometric", _face_quality_check)
run_test("Face enrollment", "Citizen", "face-biometric", _face_enroll)
run_test("Face 1:1 verification", "Citizen", "face-biometric", _face_verify)
run_test("Face liveness detection", "Citizen", "face-biometric", _face_liveness)
run_test("Face 1:N identification", "Citizen", "face-biometric", _face_identify)
run_test("Face attribute analysis", "Citizen", "face-biometric", _face_attributes)
run_test("Deepfake detection", "Citizen", "face-biometric", _face_deepfake_detect)
run_test("Batch face identification", "Citizen", "face-biometric", _face_batch_identify)
run_test("Active liveness challenge", "Citizen", "face-biometric", _face_active_liveness)
run_test("Multi-frame video verification", "Citizen", "face-biometric", _face_video_verify)
run_test("ICAO fidelity assessment", "Citizen", "face-biometric", _fidelity_assess)
run_test("Quality-gated enrollment", "Citizen", "face-biometric", _fidelity_enroll_gated)

# ─── STAKEHOLDER: CITIZEN — NINAUTH WORKFLOWS ─────────────────────────────────
test_section("4. CITIZEN — NINAUTH / NIMC IDENTITY WORKFLOWS")

def _ninauth_authorize_url():
    r = requests.get(f"{BRIDGE_URL}/v1/ninauth/authorize?redirect_uri=http://localhost:3000/callback&scope=openid+profile+nin", headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 302, 503), f"NINAuth authorize returned {r.status_code}: {r.text[:200]}"

def _ninauth_verify_nin():
    payload = {
        "nin": "12345678901",
        "first_name": "Aminu",
        "last_name": "Bello",
        "date_of_birth": "1990-05-15",
    }
    r = requests.post(f"{BRIDGE_URL}/v1/ninauth/verify-nin", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 401, 422, 503), f"NINAuth verify-NIN returned {r.status_code}: {r.text[:200]}"

def _ninauth_face_match():
    payload = {
        "nin": "12345678901",
        "live_image_b64": make_face_image_b64(),
        "check_liveness": True,
    }
    r = requests.post(f"{BRIDGE_URL}/v1/ninauth/face-match", json=payload, headers=HEADERS_INTERNAL, timeout=30)
    assert r.status_code in (200, 401, 422, 503), f"NINAuth face-match returned {r.status_code}: {r.text[:200]}"

def _ninauth_vc_verify():
    payload = {
        "vc_jwt": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.test.signature",
        "expected_subject": "12345678901",
    }
    r = requests.post(f"{BRIDGE_URL}/v1/ninauth/verify-vc", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 401, 422, 503), f"NINAuth VC verify returned {r.status_code}: {r.text[:200]}"

run_test("NINAuth OIDC authorization URL", "Citizen", "bridge/ninauth", _ninauth_authorize_url)
run_test("NIN direct verification", "Citizen", "bridge/ninauth", _ninauth_verify_nin)
run_test("NIN + face biometric match", "Citizen", "bridge/ninauth", _ninauth_face_match)
run_test("W3C Verifiable Credential verify", "Citizen", "bridge/ninauth", _ninauth_vc_verify)

# ─── STAKEHOLDER: PARTNER / THIRD-PARTY APP ───────────────────────────────────
test_section("5. PARTNER / THIRD-PARTY APP WORKFLOWS")

def _partner_face_verify():
    if not PARTNER_API_KEY:
        raise AssertionError("SKIP: No TEST_PARTNER_API_KEY set (set env var to test partner flows)")
    payload = {
        "subject_id": TEST_SUBJECT_ID,
        "image_b64": make_face_image_b64(),
    }
    r = requests.post(f"{BRIDGE_URL}/partner/v1/face/verify", json=payload, headers=HEADERS_PARTNER, timeout=30)
    assert r.status_code in (200, 401, 404), f"Partner face verify returned {r.status_code}: {r.text[:200]}"

def _partner_face_identify():
    if not PARTNER_API_KEY:
        raise AssertionError("SKIP: No TEST_PARTNER_API_KEY set")
    payload = {"image_b64": make_face_image_b64(), "top_k": 3}
    r = requests.post(f"{BRIDGE_URL}/partner/v1/face/identify", json=payload, headers=HEADERS_PARTNER, timeout=30)
    assert r.status_code in (200, 401, 403), f"Partner face identify returned {r.status_code}: {r.text[:200]}"

def _partner_public_key():
    r = requests.get(f"{BRIDGE_URL}/partner/v1/face/public-key", timeout=10)
    assert r.status_code in (200, 503), f"Partner public-key returned {r.status_code}: {r.text[:200]}"

run_test("Partner face verify (API key auth)", "Partner", "bridge/partner", _partner_face_verify)
run_test("Partner face identify (scope check)", "Partner", "bridge/partner", _partner_face_identify)
run_test("Partner public key endpoint", "Partner", "bridge/partner", _partner_public_key)

# ─── STAKEHOLDER: COMPLIANCE / AUDIT OFFICER ──────────────────────────────────
test_section("6. COMPLIANCE / AUDIT OFFICER WORKFLOWS")

def _bias_audit_record():
    payload = {
        "subject_id": TEST_SUBJECT_ID,
        "operation": "verify",
        "result": "accepted",
        "similarity_score": 0.85,
        "liveness_score": 0.92,
        "age_group": "25-34",
        "gender": "MALE",
        "partner_id": "TEST-PARTNER",
        "latency_ms": 145,
    }
    r = requests.post(f"{BIAS_AUDIT_URL}/audit/record", json=payload, timeout=10)
    assert r.status_code in (200, 201), f"Bias audit record returned {r.status_code}: {r.text[:200]}"

def _bias_audit_report():
    r = requests.get(f"{BIAS_AUDIT_URL}/audit/bias-report?days=7", timeout=10)
    assert r.status_code == 200, f"Bias audit report returned {r.status_code}: {r.text[:200]}"
    data = r.json()
    assert "groups" in data or "summary" in data or "report" in data, f"Unexpected bias report structure: {data}"

def _bias_audit_ndpr_consent():
    payload = {
        "subject_id": TEST_SUBJECT_ID,
        "consent_type": "biometric_enrollment",
        "granted": True,
        "ip_address": "127.0.0.1",
        "user_agent": "smoke-test/1.0",
    }
    r = requests.post(f"{BIAS_AUDIT_URL}/audit/consent", json=payload, timeout=10)
    assert r.status_code in (200, 201), f"NDPR consent record returned {r.status_code}: {r.text[:200]}"

def _fidelity_audit_log():
    payload = {
        "subject_id": TEST_SUBJECT_ID,
        "operation": "quality_check",
        "overall_score": 0.82,
        "icao_compliant": True,
        "passed": True,
        "context": "enrollment",
    }
    r = requests.post(f"{BIAS_AUDIT_URL}/audit/fidelity", json=payload, timeout=10)
    assert r.status_code in (200, 201), f"Fidelity audit log returned {r.status_code}: {r.text[:200]}"

run_test("Bias audit event recording", "Compliance", "face-bias-audit", _bias_audit_record)
run_test("Bias report generation (FAR/FRR)", "Compliance", "face-bias-audit", _bias_audit_report)
run_test("NDPR consent audit trail", "Compliance", "face-bias-audit", _bias_audit_ndpr_consent)
run_test("Photo fidelity audit log", "Compliance", "face-bias-audit", _fidelity_audit_log)

# ─── STAKEHOLDER: HUB OPERATOR — BRIDGE MANAGEMENT ───────────────────────────
test_section("7. HUB OPERATOR — BRIDGE MANAGEMENT WORKFLOWS")

def _bridge_health_full():
    r = requests.get(f"{BRIDGE_URL}/health", headers=HEADERS_INTERNAL, timeout=5)
    assert r.status_code == 200, f"Bridge health returned {r.status_code}"

def _bridge_face_quality_relay():
    payload = {"image_b64": make_face_image_b64()}
    r = requests.post(f"{BRIDGE_URL}/v1/face/quality", json=payload, headers=HEADERS_INTERNAL, timeout=30)
    assert r.status_code in (200, 503), f"Bridge face quality relay returned {r.status_code}: {r.text[:200]}"

def _bridge_face_verify_relay():
    payload = {
        "subject_id": TEST_SUBJECT_ID,
        "image_b64": make_face_image_b64(),
        "check_liveness": True,
    }
    r = requests.post(f"{BRIDGE_URL}/v1/face/verify", json=payload, headers=HEADERS_INTERNAL, timeout=30)
    assert r.status_code in (200, 404, 503), f"Bridge face verify relay returned {r.status_code}: {r.text[:200]}"

def _bridge_fidelity_assess_relay():
    payload = {"image_b64": make_face_image_b64(), "context": "enrollment"}
    r = requests.post(f"{BRIDGE_URL}/v1/fidelity/assess", json=payload, headers=HEADERS_INTERNAL, timeout=30)
    assert r.status_code in (200, 503), f"Bridge fidelity assess relay returned {r.status_code}: {r.text[:200]}"

def _bridge_face_enroll_relay():
    payload = {
        "subject_id": f"{TEST_SUBJECT_ID}-BRIDGE",
        "image_b64": make_face_image_b64(),
        "metadata": {"source": "smoke_test"},
    }
    r = requests.post(f"{BRIDGE_URL}/v1/face/enroll", json=payload, headers=HEADERS_INTERNAL, timeout=30)
    assert r.status_code in (200, 201, 503), f"Bridge face enroll relay returned {r.status_code}: {r.text[:200]}"

def _bridge_face_identify_relay():
    payload = {"image_b64": make_face_image_b64(), "top_k": 3}
    r = requests.post(f"{BRIDGE_URL}/v1/face/identify", json=payload, headers=HEADERS_INTERNAL, timeout=30)
    assert r.status_code in (200, 503), f"Bridge face identify relay returned {r.status_code}: {r.text[:200]}"

def _bridge_face_liveness_relay():
    payload = {"image_b64": make_face_image_b64()}
    r = requests.post(f"{BRIDGE_URL}/v1/face/liveness", json=payload, headers=HEADERS_INTERNAL, timeout=30)
    assert r.status_code in (200, 503), f"Bridge face liveness relay returned {r.status_code}: {r.text[:200]}"

def _bridge_face_attributes_relay():
    payload = {"image_b64": make_face_image_b64()}
    r = requests.post(f"{BRIDGE_URL}/v1/face/attributes", json=payload, headers=HEADERS_INTERNAL, timeout=30)
    assert r.status_code in (200, 503), f"Bridge face attributes relay returned {r.status_code}: {r.text[:200]}"

def _bridge_deepfake_relay():
    payload = {"image_b64": make_face_image_b64()}
    r = requests.post(f"{BRIDGE_URL}/v1/face/deepfake-detect", json=payload, headers=HEADERS_INTERNAL, timeout=30)
    assert r.status_code in (200, 503), f"Bridge deepfake detect relay returned {r.status_code}: {r.text[:200]}"

def _bridge_active_liveness_relay():
    payload = {
        "frames": [make_face_image_b64(), make_face_image_b64()],
        "challenge": "blink",
    }
    r = requests.post(f"{BRIDGE_URL}/v1/face/active-liveness", json=payload, headers=HEADERS_INTERNAL, timeout=30)
    assert r.status_code in (200, 503), f"Bridge active liveness relay returned {r.status_code}: {r.text[:200]}"

def _bridge_batch_identify_relay():
    payload = {
        "images": [{"image_b64": make_face_image_b64(), "ref_id": "t1"}],
        "top_k": 3,
    }
    r = requests.post(f"{BRIDGE_URL}/v1/face/batch-identify", json=payload, headers=HEADERS_INTERNAL, timeout=60)
    assert r.status_code in (200, 503), f"Bridge batch identify relay returned {r.status_code}: {r.text[:200]}"

run_test("Bridge health (full)", "Hub Operator", "bridge", _bridge_health_full)
run_test("Bridge → face quality relay", "Hub Operator", "bridge", _bridge_face_quality_relay)
run_test("Bridge → face verify relay", "Hub Operator", "bridge", _bridge_face_verify_relay)
run_test("Bridge → face enroll relay", "Hub Operator", "bridge", _bridge_face_enroll_relay)
run_test("Bridge → face identify relay", "Hub Operator", "bridge", _bridge_face_identify_relay)
run_test("Bridge → face liveness relay", "Hub Operator", "bridge", _bridge_face_liveness_relay)
run_test("Bridge → face attributes relay", "Hub Operator", "bridge", _bridge_face_attributes_relay)
run_test("Bridge → deepfake detect relay", "Hub Operator", "bridge", _bridge_deepfake_relay)
run_test("Bridge → active liveness relay", "Hub Operator", "bridge", _bridge_active_liveness_relay)
run_test("Bridge → batch identify relay", "Hub Operator", "bridge", _bridge_batch_identify_relay)
run_test("Bridge → fidelity assess relay", "Hub Operator", "bridge", _bridge_fidelity_assess_relay)

# ─── QDRANT VECTOR DB WORKFLOWS ───────────────────────────────────────────────
test_section("8. VECTOR DATABASE (QDRANT) WORKFLOWS")

def _qdrant_list_collections():
    r = requests.get(f"{QDRANT_URL}/collections", timeout=5)
    assert r.status_code == 200, f"Qdrant list collections returned {r.status_code}"
    data = r.json()
    assert "result" in data, f"Unexpected Qdrant response: {data}"

def _qdrant_face_collection_exists():
    r = requests.get(f"{QDRANT_URL}/collections/face_embeddings", timeout=5)
    assert r.status_code in (200, 404), f"Qdrant face_embeddings check returned {r.status_code}"

def _qdrant_upsert_and_search():
    # Create collection if not exists
    requests.put(
        f"{QDRANT_URL}/collections/smoke_test_collection",
        json={"vectors": {"size": 512, "distance": "Cosine"}},
        timeout=10,
    )
    # Upsert a test vector
    vec = np.random.randn(512).tolist()
    r = requests.put(
        f"{QDRANT_URL}/collections/smoke_test_collection/points",
        json={"points": [{"id": 1, "vector": vec, "payload": {"subject_id": "SMOKE-TEST"}}]},
        timeout=10,
    )
    assert r.status_code in (200, 206), f"Qdrant upsert returned {r.status_code}: {r.text[:200]}"
    # Search
    r2 = requests.post(
        f"{QDRANT_URL}/collections/smoke_test_collection/points/search",
        json={"vector": vec, "limit": 3, "with_payload": True},
        timeout=10,
    )
    assert r2.status_code == 200, f"Qdrant search returned {r2.status_code}: {r2.text[:200]}"
    data = r2.json()
    assert len(data.get("result", [])) > 0, f"Qdrant search returned no results: {data}"

run_test("Qdrant list collections", "Platform", "qdrant", _qdrant_list_collections)
run_test("Qdrant face_embeddings collection", "Platform", "qdrant", _qdrant_face_collection_exists)
run_test("Qdrant upsert + cosine search", "Platform", "qdrant", _qdrant_upsert_and_search)

# ─── FINAL REPORT ─────────────────────────────────────────────────────────────
test_section("SMOKE TEST RESULTS SUMMARY")

total   = len(results)
passed  = sum(1 for r in results if r.passed)
failed  = total - passed
skipped = sum(1 for r in results if "SKIP" in r.message)

print(f"\n  Total:   {total}")
print(f"  Passed:  {passed}  ✅")
print(f"  Failed:  {failed - skipped}  ❌")
print(f"  Skipped: {skipped}  ⏭")
print(f"  Pass Rate: {passed/total*100:.1f}%\n")

if failed - skipped > 0:
    print("  FAILED TESTS:")
    for r in results:
        if not r.passed and "SKIP" not in r.message:
            print(f"    ❌ [{r.stakeholder}] {r.name}")
            print(f"       Service: {r.service}")
            print(f"       Reason:  {r.message}")
    print()

# Write JSON report
report = {
    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "summary": {"total": total, "passed": passed, "failed": failed - skipped, "skipped": skipped},
    "results": [
        {
            "name": r.name,
            "stakeholder": r.stakeholder,
            "service": r.service,
            "passed": r.passed,
            "message": r.message,
            "duration_ms": round(r.duration_ms, 1),
        }
        for r in results
    ],
}
report_path = "/tmp/nexthub_smoke_test_report.json"
with open(report_path, "w") as f:
    json.dump(report, f, indent=2)
print(f"  Full report written to: {report_path}")

# Exit with non-zero if any real failures
real_failures = [r for r in results if not r.passed and "SKIP" not in r.message]
sys.exit(1 if real_failures else 0)
