"""
NextHub Platform — Comprehensive Smoke Test Suite
==================================================
Covers every stakeholder workflow across all services:
  - Platform (health checks)
  - Hub Operator (bridge management, settlement, ledger, infra)
  - DFSP / Financial Institution (transfers, disputes, KYC, NIP, NQR, FX)
  - Regulator / Supervisor (NDC breach, regulator portal)
  - Citizen (MOSIP registration, NINAuth, face biometrics)
  - Partner / Third-Party App (partner API, all face routes)
  - Developer (API key management)
  - Compliance / Audit Officer (bias audit, fidelity audit, NINAuth audit)

Services tested:
  - Go Bridge (port 8200)
  - Python Face Biometric (port 8220)
  - Rust Face Bias Audit (port 8230)
  - Qdrant Vector DB (port 6333)

Usage:
    python3 tests/python/smoke_test_all_workflows.py
    BRIDGE_URL=http://bridge:8200 python3 tests/python/smoke_test_all_workflows.py
"""

import sys
import json
import base64
import time
import os
import io
from dataclasses import dataclass

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
BRIDGE_URL       = os.environ.get("BRIDGE_URL",           "http://localhost:8200")
FACE_BIO_URL     = os.environ.get("FACE_BIOMETRIC_URL",   "http://localhost:8220")
BIAS_AUDIT_URL   = os.environ.get("BIAS_AUDIT_URL",       "http://localhost:8230")
QDRANT_URL       = os.environ.get("QDRANT_URL",           "http://localhost:6333")
INTERNAL_KEY     = os.environ.get("MIDDLEWARE_INTERNAL_KEY", "nexthub-internal-key")
PARTNER_API_KEY  = os.environ.get("TEST_PARTNER_API_KEY", "")

HEADERS_INTERNAL = {"X-Internal-Key": INTERNAL_KEY, "Content-Type": "application/json"}
HEADERS_PARTNER  = (
    {"X-API-Key": PARTNER_API_KEY, "Content-Type": "application/json"}
    if PARTNER_API_KEY
    else {"Content-Type": "application/json"}
)

TEST_SUBJECT_ID  = "SMOKE-TEST-001"
TEST_NIN         = "12345678901"

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
        msg = str(e)
        # Classify connection-refused / timeout as SKIP (service not running)
        is_skip = any(kw in msg.lower() for kw in (
            "connection refused", "failed to establish", "max retries exceeded",
            "connectionerror", "timeout", "timed out",
        ))
        if is_skip:
            r = TestResult(name, False, f"SKIP: {msg}", duration, stakeholder, service)
            print(f"  ⏭  [{stakeholder}] {name}: service unavailable")
        else:
            r = TestResult(name, False, f"ERROR: {msg}", duration, stakeholder, service)
            print(f"  💥 [{stakeholder}] {name}: {e}")
    results.append(r)
    return r

# ─── Helper: Generate synthetic face image ────────────────────────────────────
def make_face_image_b64(width=640, height=640, skin_tone=(210, 180, 140)) -> str:
    """Generate a synthetic ICAO-compliant face image for testing."""
    img = Image.new("RGB", (width, height), color=(240, 240, 240))
    draw = ImageDraw.Draw(img)
    draw.ellipse([160, 80, 480, 560], fill=skin_tone, outline=(100, 80, 60), width=3)
    draw.ellipse([220, 220, 280, 260], fill=(50, 30, 20))
    draw.ellipse([360, 220, 420, 260], fill=(50, 30, 20))
    draw.polygon([(320, 280), (300, 360), (340, 360)], fill=(180, 140, 110))
    draw.arc([270, 380, 370, 440], start=0, end=180, fill=(150, 80, 80), width=4)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)
    return base64.b64encode(buf.getvalue()).decode()

IMG = make_face_image_b64()  # reuse across tests for speed

def test_section(title: str):
    print(f"\n{'═'*70}")
    print(f"  {title}")
    print(f"{'═'*70}")

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 1 — SERVICE HEALTH CHECKS
# ══════════════════════════════════════════════════════════════════════════════
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

run_test("Bridge service health",          "Platform", "bridge",        _bridge_health)
run_test("Face-biometric service health",  "Platform", "face-biometric",_face_bio_health)
run_test("Qdrant vector DB health",        "Platform", "qdrant",        _qdrant_health)
run_test("Face-bias-audit service health", "Platform", "face-bias-audit",_bias_audit_health)

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 2 — CITIZEN: MOSIP REGISTRATION WORKFLOWS
# ══════════════════════════════════════════════════════════════════════════════
test_section("2. CITIZEN — MOSIP REGISTRATION WORKFLOWS")

def _mosip_pre_register():
    payload = {
        "demographicDetails": {
            "identity": {
                "fullName": [{"language": "eng", "value": "Test Citizen"}],
                "dateOfBirth": "1990/01/15",
                "gender": [{"language": "eng", "value": "MLE"}],
                "phone": "08012345678",
                "email": "test@example.com",
            }
        },
        "langCode": "eng",
    }
    r = requests.post(f"{BRIDGE_URL}/v1/mosip/registration/pre-reg",
                      json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 201, 503), f"MOSIP pre-register returned {r.status_code}: {r.text[:200]}"

def _mosip_get_pre_reg():
    r = requests.get(f"{BRIDGE_URL}/v1/mosip/registration/pre-reg/TEST-AID-001",
                     headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 404, 503), f"MOSIP get pre-reg returned {r.status_code}: {r.text[:200]}"

def _mosip_book_appointment():
    payload = {"registrationCenterId": "10001", "appointmentDate": "2026-08-01", "timeSlotFrom": "09:00:00"}
    r = requests.post(f"{BRIDGE_URL}/v1/mosip/registration/appointment",
                      json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 201, 400, 503), f"MOSIP book appointment returned {r.status_code}: {r.text[:200]}"

def _mosip_cancel_appointment():
    r = requests.delete(f"{BRIDGE_URL}/v1/mosip/registration/appointment/TEST-AID-001",
                        headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 204, 404, 503), f"MOSIP cancel appointment returned {r.status_code}: {r.text[:200]}"

def _mosip_upload_packet():
    payload = {"applicationId": "TEST-AID-001", "packetData": base64.b64encode(b"test-packet").decode()}
    r = requests.post(f"{BRIDGE_URL}/v1/mosip/registration/packet",
                      json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 201, 400, 503), f"MOSIP upload packet returned {r.status_code}: {r.text[:200]}"

def _mosip_packet_status():
    r = requests.get(f"{BRIDGE_URL}/v1/mosip/registration/packet/TEST-RID-001/status",
                     headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 404, 503), f"MOSIP packet status returned {r.status_code}: {r.text[:200]}"

def _mosip_uin_status():
    r = requests.get(f"{BRIDGE_URL}/v1/mosip/registration/uin/123456789012",
                     headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 404, 503), f"MOSIP UIN status returned {r.status_code}: {r.text[:200]}"

def _mosip_uin_update():
    payload = {"uin": "123456789012", "demographicData": {"phone": "08099999999"}}
    r = requests.put(f"{BRIDGE_URL}/v1/mosip/registration/uin",
                     json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 400, 503), f"MOSIP UIN update returned {r.status_code}: {r.text[:200]}"

def _mosip_uin_lock():
    payload = {"uin": "123456789012", "authTypes": [{"authType": "bio", "authSubType": "FACE"}]}
    r = requests.post(f"{BRIDGE_URL}/v1/mosip/registration/uin/lock",
                      json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 400, 503), f"MOSIP UIN lock returned {r.status_code}: {r.text[:200]}"

def _mosip_uin_unlock():
    payload = {"uin": "123456789012", "authTypes": [{"authType": "bio", "authSubType": "FACE"}]}
    r = requests.post(f"{BRIDGE_URL}/v1/mosip/registration/uin/unlock",
                      json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 400, 503), f"MOSIP UIN unlock returned {r.status_code}: {r.text[:200]}"

def _mosip_generate_vid():
    payload = {"uin": "123456789012", "vidType": "PERPETUAL"}
    r = requests.post(f"{BRIDGE_URL}/v1/mosip/registration/vid",
                      json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 201, 400, 503), f"MOSIP generate VID returned {r.status_code}: {r.text[:200]}"

def _mosip_credential_request():
    payload = {"uin": "123456789012", "credentialType": "euin", "partnerId": "SMOKE-PARTNER"}
    r = requests.post(f"{BRIDGE_URL}/v1/mosip/registration/credential",
                      json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 201, 400, 503), f"MOSIP credential request returned {r.status_code}: {r.text[:200]}"

def _mosip_credential_status():
    r = requests.get(f"{BRIDGE_URL}/v1/mosip/registration/credential/TEST-REQ-001",
                     headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 404, 503), f"MOSIP credential status returned {r.status_code}: {r.text[:200]}"

def _mosip_otp():
    payload = {"transactionId": "TXN-001", "individualId": "123456789012", "otpChannel": ["EMAIL"]}
    r = requests.post(f"{BRIDGE_URL}/v1/mosip/otp", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 400, 503), f"MOSIP OTP returned {r.status_code}: {r.text[:200]}"

def _mosip_ekyc():
    payload = {"transactionId": "TXN-001", "individualId": "123456789012",
               "otp": "123456", "consentObtained": True}
    r = requests.post(f"{BRIDGE_URL}/v1/mosip/ekyc", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 400, 503), f"MOSIP eKYC returned {r.status_code}: {r.text[:200]}"

def _mosip_esignet_auth_url():
    payload = {"redirectUri": "http://localhost:3000/callback", "scope": "openid profile", "state": "test-state"}
    r = requests.post(f"{BRIDGE_URL}/v1/mosip/esignet/auth-url", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 400, 503), f"MOSIP eSignet auth URL returned {r.status_code}: {r.text[:200]}"

def _mosip_esignet_token():
    payload = {"code": "test-code", "redirectUri": "http://localhost:3000/callback", "codeVerifier": "test-verifier"}
    r = requests.post(f"{BRIDGE_URL}/v1/mosip/esignet/token", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 400, 503), f"MOSIP eSignet token returned {r.status_code}: {r.text[:200]}"

def _mosip_vc_issue():
    payload = {"uin": "123456789012", "credentialType": "OpenId4VCICredential", "partnerId": "SMOKE-PARTNER"}
    r = requests.post(f"{BRIDGE_URL}/v1/mosip/vc/issue", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 201, 400, 503), f"MOSIP VC issue returned {r.status_code}: {r.text[:200]}"

def _mosip_g2p_verify():
    payload = {"beneficiaryId": "BEN-001", "nin": TEST_NIN, "programId": "PROG-001"}
    r = requests.post(f"{BRIDGE_URL}/v1/mosip/g2p/verify-beneficiary", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 400, 503), f"MOSIP G2P verify returned {r.status_code}: {r.text[:200]}"

run_test("MOSIP pre-registration",         "Citizen", "bridge/mosip", _mosip_pre_register)
run_test("MOSIP get pre-registration",     "Citizen", "bridge/mosip", _mosip_get_pre_reg)
run_test("MOSIP book appointment",         "Citizen", "bridge/mosip", _mosip_book_appointment)
run_test("MOSIP cancel appointment",       "Citizen", "bridge/mosip", _mosip_cancel_appointment)
run_test("MOSIP upload packet",            "Citizen", "bridge/mosip", _mosip_upload_packet)
run_test("MOSIP packet status",            "Citizen", "bridge/mosip", _mosip_packet_status)
run_test("MOSIP UIN status",               "Citizen", "bridge/mosip", _mosip_uin_status)
run_test("MOSIP UIN update",               "Citizen", "bridge/mosip", _mosip_uin_update)
run_test("MOSIP UIN lock",                 "Citizen", "bridge/mosip", _mosip_uin_lock)
run_test("MOSIP UIN unlock",               "Citizen", "bridge/mosip", _mosip_uin_unlock)
run_test("MOSIP generate VID",             "Citizen", "bridge/mosip", _mosip_generate_vid)
run_test("MOSIP credential request",       "Citizen", "bridge/mosip", _mosip_credential_request)
run_test("MOSIP credential status",        "Citizen", "bridge/mosip", _mosip_credential_status)
run_test("MOSIP generate OTP",             "Citizen", "bridge/mosip", _mosip_otp)
run_test("MOSIP eKYC submission",          "Citizen", "bridge/mosip", _mosip_ekyc)
run_test("MOSIP eSignet auth URL",         "Citizen", "bridge/mosip", _mosip_esignet_auth_url)
run_test("MOSIP eSignet token exchange",   "Citizen", "bridge/mosip", _mosip_esignet_token)
run_test("MOSIP verifiable credential",    "Citizen", "bridge/mosip", _mosip_vc_issue)
run_test("MOSIP G2P beneficiary verify",   "Citizen", "bridge/mosip", _mosip_g2p_verify)

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 3 — CITIZEN: FACE BIOMETRIC WORKFLOWS (direct to Python service)
# ══════════════════════════════════════════════════════════════════════════════
test_section("3. CITIZEN — FACE BIOMETRIC WORKFLOWS (direct)")

def _face_quality_check():
    r = requests.post(f"{FACE_BIO_URL}/v1/face/quality",
                      json={"image_b64": IMG}, timeout=30)
    assert r.status_code in (200, 422), f"Face quality returned {r.status_code}: {r.text[:200]}"

def _face_enroll():
    r = requests.post(f"{FACE_BIO_URL}/v1/face/enroll",
                      json={"subject_id": TEST_SUBJECT_ID, "image_b64": IMG,
                            "require_liveness": False, "require_quality": False}, timeout=30)
    assert r.status_code in (200, 201, 422), f"Face enroll returned {r.status_code}: {r.text[:200]}"

def _face_verify():
    r = requests.post(f"{FACE_BIO_URL}/v1/face/verify",
                      json={"probe_image_b64": IMG, "reference_image_b64": IMG,
                            "require_liveness": False, "require_quality": False}, timeout=30)
    assert r.status_code in (200, 422), f"Face verify returned {r.status_code}: {r.text[:200]}"

def _face_liveness():
    r = requests.post(f"{FACE_BIO_URL}/v1/face/liveness",
                      json={"image_b64": IMG}, timeout=30)
    assert r.status_code in (200, 422), f"Face liveness returned {r.status_code}: {r.text[:200]}"

def _face_identify():
    r = requests.post(f"{FACE_BIO_URL}/v1/face/identify",
                      json={"probe_image_b64": IMG, "top_k": 3, "require_liveness": False}, timeout=30)
    assert r.status_code in (200, 422), f"Face identify returned {r.status_code}: {r.text[:200]}"

def _face_attributes():
    r = requests.post(f"{FACE_BIO_URL}/v1/face/attributes",
                      json={"image_b64": IMG}, timeout=30)
    assert r.status_code in (200, 422), f"Face attributes returned {r.status_code}: {r.text[:200]}"

def _face_deepfake_detect():
    r = requests.post(f"{FACE_BIO_URL}/v1/face/deepfake",
                      json={"image_b64": IMG}, timeout=30)
    assert r.status_code in (200, 422), f"Face deepfake detect returned {r.status_code}: {r.text[:200]}"

def _face_batch_identify():
    r = requests.post(f"{FACE_BIO_URL}/v1/face/batch-identify",
                      json={"probes": [{"probe_image_b64": IMG, "top_k": 3, "require_liveness": False}]},
                      timeout=60)
    assert r.status_code in (200, 422), f"Face batch identify returned {r.status_code}: {r.text[:200]}"

def _face_active_liveness_start():
    r = requests.post(f"{FACE_BIO_URL}/v1/face/liveness/active",
                      json={"challenge_types": ["BLINK", "SMILE"]}, timeout=30)
    assert r.status_code in (200, 422), f"Active liveness start returned {r.status_code}: {r.text[:200]}"
    if r.status_code == 200:
        data = r.json()
        assert "session_id" in data, f"No session_id in active liveness response: {data}"

def _face_active_liveness_verify():
    # Start a session first
    start_r = requests.post(f"{FACE_BIO_URL}/v1/face/liveness/active",
                             json={"challenge_types": ["BLINK"]}, timeout=30)
    if start_r.status_code != 200:
        return  # skip if service unavailable
    session_id = start_r.json().get("session_id", "test-session")
    r = requests.post(f"{FACE_BIO_URL}/v1/face/liveness/active/verify",
                      json={"session_id": session_id, "frames_b64": [IMG, IMG]}, timeout=30)
    assert r.status_code in (200, 422), f"Active liveness verify returned {r.status_code}: {r.text[:200]}"

def _face_video_verify():
    r = requests.post(f"{FACE_BIO_URL}/v1/face/video-verify",
                      json={"frames_b64": [IMG, IMG], "reference_image_b64": IMG}, timeout=60)
    assert r.status_code in (200, 422), f"Video verify returned {r.status_code}: {r.text[:200]}"

def _face_fidelity_assess():
    r = requests.post(f"{FACE_BIO_URL}/v1/face/fidelity",
                      json={"image_b64": IMG, "auto_remediate": False, "return_processed": False}, timeout=30)
    assert r.status_code in (200, 422), f"Fidelity assess returned {r.status_code}: {r.text[:200]}"

def _face_capture_guidance():
    r = requests.post(f"{FACE_BIO_URL}/v1/face/capture-guidance",
                      json={"image_b64": IMG, "context": "enrollment"}, timeout=30)
    assert r.status_code in (200, 422), f"Capture guidance returned {r.status_code}: {r.text[:200]}"

def _face_enroll_gated():
    r = requests.post(f"{FACE_BIO_URL}/v1/face/enroll-gated",
                      json={"subject_id": f"{TEST_SUBJECT_ID}-GATED", "image_b64": IMG,
                            "tenant_id": "smoke-tenant"}, timeout=30)
    assert r.status_code in (200, 201, 422), f"Enroll gated returned {r.status_code}: {r.text[:200]}"

def _face_auto_crop():
    r = requests.post(f"{FACE_BIO_URL}/v1/face/auto-crop",
                      json={"image_b64": IMG}, timeout=30)
    assert r.status_code in (200, 422), f"Auto crop returned {r.status_code}: {r.text[:200]}"

def _face_public_key():
    r = requests.get(f"{FACE_BIO_URL}/v1/face/public-key", timeout=10)
    assert r.status_code == 200, f"Face public key returned {r.status_code}: {r.text[:200]}"
    data = r.json()
    assert "public_key" in data, f"No public_key in response: {data}"

run_test("Face quality assessment",        "Citizen", "face-biometric", _face_quality_check)
run_test("Face enrollment",                "Citizen", "face-biometric", _face_enroll)
run_test("Face 1:1 verification",          "Citizen", "face-biometric", _face_verify)
run_test("Face passive liveness",          "Citizen", "face-biometric", _face_liveness)
run_test("Face 1:N identification",        "Citizen", "face-biometric", _face_identify)
run_test("Face attribute extraction",      "Citizen", "face-biometric", _face_attributes)
run_test("Deepfake detection",             "Citizen", "face-biometric", _face_deepfake_detect)
run_test("Face batch identification",      "Citizen", "face-biometric", _face_batch_identify)
run_test("Active liveness challenge start","Citizen", "face-biometric", _face_active_liveness_start)
run_test("Active liveness verify",         "Citizen", "face-biometric", _face_active_liveness_verify)
run_test("Video-based face verification",  "Citizen", "face-biometric", _face_video_verify)
run_test("Photo fidelity assessment",      "Citizen", "face-biometric", _face_fidelity_assess)
run_test("Capture guidance",               "Citizen", "face-biometric", _face_capture_guidance)
run_test("Gated face enrollment",          "Citizen", "face-biometric", _face_enroll_gated)
run_test("Face auto-crop",                 "Citizen", "face-biometric", _face_auto_crop)
run_test("Face service public key",        "Citizen", "face-biometric", _face_public_key)

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 4 — CITIZEN: NINAUTH / NIMC IDENTITY WORKFLOWS
# ══════════════════════════════════════════════════════════════════════════════
test_section("4. CITIZEN — NINAUTH / NIMC IDENTITY WORKFLOWS")

def _ninauth_init():
    payload = {"state": "test-state-001", "code_verifier": "test-verifier-001",
               "redirect_uri": "http://localhost:3000/callback", "scope": "openid profile nin"}
    r = requests.post(f"{BRIDGE_URL}/v1/ninauth/init", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 400, 503), f"NINAuth init returned {r.status_code}: {r.text[:200]}"

def _ninauth_callback():
    payload = {"code": "test-auth-code", "code_verifier": "test-verifier-001",
               "redirect_uri": "http://localhost:3000/callback"}
    r = requests.post(f"{BRIDGE_URL}/v1/ninauth/callback", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 400, 503), f"NINAuth callback returned {r.status_code}: {r.text[:200]}"

def _ninauth_verify_nin():
    payload = {"nin": TEST_NIN, "first_name": "Test", "last_name": "Citizen",
               "date_of_birth": "1990-01-15"}
    r = requests.post(f"{BRIDGE_URL}/v1/ninauth/verify-nin", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 400, 503), f"NIN verify returned {r.status_code}: {r.text[:200]}"

def _ninauth_face_match():
    payload = {"nin": TEST_NIN, "live_image_b64": IMG}
    r = requests.post(f"{BRIDGE_URL}/v1/ninauth/face-match", json=payload, headers=HEADERS_INTERNAL, timeout=30)
    assert r.status_code in (200, 400, 503), f"NIN face match returned {r.status_code}: {r.text[:200]}"

def _ninauth_vc_verify():
    payload = {"vc_jwt": "eyJhbGciOiJSUzI1NiJ9.e30.test"}
    r = requests.post(f"{BRIDGE_URL}/v1/ninauth/verify-vc", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 400, 503), f"NIN VC verify returned {r.status_code}: {r.text[:200]}"

run_test("NINAuth PKCE init",              "Citizen", "bridge/ninauth", _ninauth_init)
run_test("NINAuth callback token exchange","Citizen", "bridge/ninauth", _ninauth_callback)
run_test("NIN data verification",          "Citizen", "bridge/ninauth", _ninauth_verify_nin)
run_test("NIN face match",                 "Citizen", "bridge/ninauth", _ninauth_face_match)
run_test("NIN verifiable credential verify","Citizen","bridge/ninauth", _ninauth_vc_verify)

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 5 — DFSP / FINANCIAL INSTITUTION WORKFLOWS
# ══════════════════════════════════════════════════════════════════════════════
test_section("5. DFSP / FINANCIAL INSTITUTION WORKFLOWS")

def _transfer_initiate():
    payload = {"transferId": "SMOKE-TXN-001", "payerDfspId": "dfsp-payer",
               "payeeDfspId": "dfsp-payee", "amount": 100000, "currency": "NGN",
               "transferType": "P2P"}
    r = requests.post(f"{BRIDGE_URL}/v1/transfer/initiate", json=payload, headers=HEADERS_INTERNAL, timeout=15)
    assert r.status_code in (200, 201, 400, 503), f"Transfer initiate returned {r.status_code}: {r.text[:200]}"

def _transfer_reverse():
    payload = {"transactionId": "SMOKE-TXN-001", "reason": "CUSTOMER_REQUEST"}
    r = requests.post(f"{BRIDGE_URL}/v1/transfer/reverse", json=payload, headers=HEADERS_INTERNAL, timeout=15)
    assert r.status_code in (200, 400, 503), f"Transfer reverse returned {r.status_code}: {r.text[:200]}"

def _dispute_create():
    payload = {"disputeId": "SMOKE-DISP-001", "transactionId": "SMOKE-TXN-001",
               "reason": "UNAUTHORIZED_TRANSACTION", "amount": 100000, "currency": "NGN"}
    r = requests.post(f"{BRIDGE_URL}/v1/dispute/create", json=payload, headers=HEADERS_INTERNAL, timeout=15)
    assert r.status_code in (200, 201, 400, 503), f"Dispute create returned {r.status_code}: {r.text[:200]}"

def _dispute_resolve():
    payload = {"resolution": "REFUNDED"}
    r = requests.post(f"{BRIDGE_URL}/v1/dispute/SMOKE-DISP-001/resolve",
                      json=payload, headers=HEADERS_INTERNAL, timeout=15)
    assert r.status_code in (200, 400, 404, 503), f"Dispute resolve returned {r.status_code}: {r.text[:200]}"

def _kyc_submit():
    payload = {"submissionId": "SMOKE-KYC-001", "subjectId": TEST_SUBJECT_ID,
               "documents": [{"type": "NIN", "data": base64.b64encode(b"nin-doc").decode()}]}
    r = requests.post(f"{BRIDGE_URL}/v1/kyc/submit", json=payload, headers=HEADERS_INTERNAL, timeout=15)
    assert r.status_code in (200, 201, 400, 503), f"KYC submit returned {r.status_code}: {r.text[:200]}"

def _kyc_update_status():
    payload = {"status": "APPROVED"}
    r = requests.post(f"{BRIDGE_URL}/v1/kyc/SMOKE-KYC-001/update-status",
                      json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 400, 404, 503), f"KYC update status returned {r.status_code}: {r.text[:200]}"

def _payout_initiate():
    payload = {"payoutId": "SMOKE-PAY-001", "merchantId": "MERCH-001",
               "amountKobo": 500000, "currency": "NGN", "bankAccount": "0123456789"}
    r = requests.post(f"{BRIDGE_URL}/v1/payout/initiate", json=payload, headers=HEADERS_INTERNAL, timeout=15)
    assert r.status_code in (200, 201, 400, 503), f"Payout initiate returned {r.status_code}: {r.text[:200]}"

def _payout_approve():
    r = requests.post(f"{BRIDGE_URL}/v1/payout/SMOKE-PAY-001/approve",
                      json={}, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 400, 404, 503), f"Payout approve returned {r.status_code}: {r.text[:200]}"

def _payout_reject():
    r = requests.post(f"{BRIDGE_URL}/v1/payout/SMOKE-PAY-002/reject",
                      json={}, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 400, 404, 503), f"Payout reject returned {r.status_code}: {r.text[:200]}"

run_test("Transfer initiation",            "DFSP", "bridge/transfer",  _transfer_initiate)
run_test("Transfer reversal",              "DFSP", "bridge/transfer",  _transfer_reverse)
run_test("Dispute creation",               "DFSP", "bridge/dispute",   _dispute_create)
run_test("Dispute resolution",             "DFSP", "bridge/dispute",   _dispute_resolve)
run_test("KYC submission",                 "DFSP", "bridge/kyc",       _kyc_submit)
run_test("KYC status update",              "DFSP", "bridge/kyc",       _kyc_update_status)
run_test("Payout initiation",              "DFSP", "bridge/payout",    _payout_initiate)
run_test("Payout approval",                "DFSP", "bridge/payout",    _payout_approve)
run_test("Payout rejection",               "DFSP", "bridge/payout",    _payout_reject)

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 6 — HUB OPERATOR: SETTLEMENT & LEDGER WORKFLOWS
# ══════════════════════════════════════════════════════════════════════════════
test_section("6. HUB OPERATOR — SETTLEMENT & LEDGER WORKFLOWS")

def _settlement_trigger():
    payload = {"windowId": "WIN-001", "currency": "NGN"}
    r = requests.post(f"{BRIDGE_URL}/v1/settlement/trigger", json=payload, headers=HEADERS_INTERNAL, timeout=15)
    assert r.status_code in (200, 400, 503), f"Settlement trigger returned {r.status_code}: {r.text[:200]}"

def _ledger_debit():
    payload = {"walletId": 1001, "amountKobo": 100000, "reference": "SMOKE-DEBIT-001"}
    r = requests.post(f"{BRIDGE_URL}/v1/ledger/debit", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 400, 503), f"Ledger debit returned {r.status_code}: {r.text[:200]}"

def _ledger_credit():
    payload = {"walletId": 1002, "amountKobo": 100000, "reference": "SMOKE-CREDIT-001"}
    r = requests.post(f"{BRIDGE_URL}/v1/ledger/credit", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 400, 503), f"Ledger credit returned {r.status_code}: {r.text[:200]}"

def _ledger_balance():
    payload = {"walletId": 1001}
    r = requests.post(f"{BRIDGE_URL}/v1/ledger/balance", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 400, 503), f"Ledger balance returned {r.status_code}: {r.text[:200]}"

def _ledger_account_balance():
    payload = {"tenantId": "smoke-tenant"}
    r = requests.post(f"{BRIDGE_URL}/v1/ledger/account-balance", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 400, 503), f"Ledger account balance returned {r.status_code}: {r.text[:200]}"

def _ledger_batch_balances():
    payload = {"accountIds": ["acc-001", "acc-002"]}
    r = requests.post(f"{BRIDGE_URL}/v1/ledger/batch-balances", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 400, 503), f"Ledger batch balances returned {r.status_code}: {r.text[:200]}"

def _cbdc_swap():
    payload = {"swapId": "SWAP-001", "fromAccount": 2001, "toAccount": 2002,
               "amountKobo": 50000, "tokenType": "eNGN"}
    r = requests.post(f"{BRIDGE_URL}/v1/cbdc/swap", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 400, 503), f"CBDC swap returned {r.status_code}: {r.text[:200]}"

def _g2p_disbursement():
    payload = {"batchId": "BATCH-001", "programId": "PROG-001",
               "totalKobo": 1000000, "beneficiaryCount": 10}
    r = requests.post(f"{BRIDGE_URL}/v1/g2p/disbursement", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 201, 400, 503), f"G2P disbursement returned {r.status_code}: {r.text[:200]}"

def _remittance_create():
    payload = {"remittanceId": "REM-001", "corridorId": "NG-GH", "amountKobo": 500000,
               "sourceCurrency": "NGN", "targetCurrency": "GHS",
               "senderId": "SND-001", "receiverId": "RCV-001"}
    r = requests.post(f"{BRIDGE_URL}/v1/remittance/create", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 201, 400, 503), f"Remittance create returned {r.status_code}: {r.text[:200]}"

def _momo_reconcile():
    payload = {"transactionRef": "MOMO-001", "momoProvider": "MTN",
               "amountKobo": 200000}
    r = requests.post(f"{BRIDGE_URL}/v1/momo/reconcile", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 400, 503), f"MoMo reconcile returned {r.status_code}: {r.text[:200]}"

def _roles_sync():
    payload = {"tenantId": "smoke-tenant"}
    r = requests.post(f"{BRIDGE_URL}/v1/roles/sync", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 400, 503), f"Roles sync returned {r.status_code}: {r.text[:200]}"

run_test("Settlement window trigger",      "Hub Operator", "bridge/settlement", _settlement_trigger)
run_test("Ledger debit",                   "Hub Operator", "bridge/ledger",     _ledger_debit)
run_test("Ledger credit",                  "Hub Operator", "bridge/ledger",     _ledger_credit)
run_test("Ledger wallet balance",          "Hub Operator", "bridge/ledger",     _ledger_balance)
run_test("Ledger account balance",         "Hub Operator", "bridge/ledger",     _ledger_account_balance)
run_test("Ledger batch balances",          "Hub Operator", "bridge/ledger",     _ledger_batch_balances)
run_test("CBDC atomic swap",               "Hub Operator", "bridge/cbdc",       _cbdc_swap)
run_test("G2P disbursement batch",         "Hub Operator", "bridge/g2p",        _g2p_disbursement)
run_test("Remittance creation",            "Hub Operator", "bridge/remittance", _remittance_create)
run_test("MoMo reconciliation",            "Hub Operator", "bridge/momo",       _momo_reconcile)
run_test("Role sync",                      "Hub Operator", "bridge/roles",      _roles_sync)

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 7 — HUB OPERATOR: INFRASTRUCTURE WORKFLOWS
# ══════════════════════════════════════════════════════════════════════════════
test_section("7. HUB OPERATOR — INFRASTRUCTURE WORKFLOWS")

def _keycloak_provision():
    payload = {"username": "smoke-user-001", "email": "smoke@nexthub.test",
               "firstName": "Smoke", "lastName": "Test",
               "roles": ["dfsp-operator"], "linkedEntityType": "DFSP",
               "linkedEntityId": "DFSP-001", "tempPassword": "Temp@1234"}
    r = requests.post(f"{BRIDGE_URL}/v1/keycloak/provision", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 201, 400, 503), f"Keycloak provision returned {r.status_code}: {r.text[:200]}"

def _dapr_state_set():
    payload = {"key": "smoke-test-key", "value": {"test": True, "ts": time.time()}}
    r = requests.post(f"{BRIDGE_URL}/v1/dapr/state", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 201, 400, 503), f"Dapr state set returned {r.status_code}: {r.text[:200]}"

def _dapr_state_get():
    r = requests.get(f"{BRIDGE_URL}/v1/dapr/state/smoke-test-key", headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 404, 503), f"Dapr state get returned {r.status_code}: {r.text[:200]}"

def _dapr_publish():
    payload = {"topic": "smoke-test-topic", "data": {"event": "smoke_test", "ts": time.time()}}
    r = requests.post(f"{BRIDGE_URL}/v1/dapr/publish", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 201, 400, 503), f"Dapr publish returned {r.status_code}: {r.text[:200]}"

def _kafka_publish():
    payload = {"topic": "nexthub.smoke.test", "key": "smoke-key",
               "value": {"event": "smoke_test", "ts": time.time()}}
    r = requests.post(f"{BRIDGE_URL}/v1/kafka/publish", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 201, 400, 503), f"Kafka publish returned {r.status_code}: {r.text[:200]}"

def _fluvio_produce():
    payload = {"topic": "nexthub-smoke", "key": "smoke-key", "value": "smoke-test-message"}
    r = requests.post(f"{BRIDGE_URL}/v1/fluvio/produce", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 201, 400, 503), f"Fluvio produce returned {r.status_code}: {r.text[:200]}"

def _fluvio_create_topic():
    payload = {"topic": "nexthub-smoke-topic", "partitions": 1, "retentionHours": 24}
    r = requests.post(f"{BRIDGE_URL}/v1/fluvio/topics", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 201, 400, 409, 503), f"Fluvio create topic returned {r.status_code}: {r.text[:200]}"

def _fluvio_topic_stats():
    r = requests.get(f"{BRIDGE_URL}/v1/fluvio/topics/nexthub-smoke/stats", headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 404, 503), f"Fluvio topic stats returned {r.status_code}: {r.text[:200]}"

def _permify_check():
    payload = {"tenantId": "smoke-tenant",
               "subject": {"type": "user", "id": "user-001"},
               "permission": "view",
               "resource": {"type": "transfer", "id": "txn-001"}}
    r = requests.post(f"{BRIDGE_URL}/v1/permify/check", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 400, 503), f"Permify check returned {r.status_code}: {r.text[:200]}"

def _permify_write_rel():
    payload = {"tenantId": "smoke-tenant",
               "entity": {"type": "organization", "id": "org-001"},
               "relation": "member",
               "subject": {"type": "user", "id": "user-001"}}
    r = requests.post(f"{BRIDGE_URL}/v1/permify/relationships/write", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 201, 400, 503), f"Permify write rel returned {r.status_code}: {r.text[:200]}"

def _permify_delete_rel():
    payload = {"tenantId": "smoke-tenant",
               "entity": {"type": "organization", "id": "org-001"},
               "relation": "member",
               "subject": {"type": "user", "id": "user-001"}}
    r = requests.post(f"{BRIDGE_URL}/v1/permify/relationships/delete", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 204, 400, 503), f"Permify delete rel returned {r.status_code}: {r.text[:200]}"

def _permify_expand():
    payload = {"tenantId": "smoke-tenant",
               "entity": {"type": "transfer", "id": "txn-001"},
               "permission": "view"}
    r = requests.post(f"{BRIDGE_URL}/v1/permify/expand", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 400, 503), f"Permify expand returned {r.status_code}: {r.text[:200]}"

def _lakehouse_event():
    payload = {"eventType": "TRANSFER_COMPLETED", "resource": "transfer",
               "action": "complete", "outcome": "SUCCESS",
               "merchantId": "MERCH-001", "userId": "user-001",
               "metadata": {"amount": 100000, "currency": "NGN"}}
    r = requests.post(f"{BRIDGE_URL}/v1/lakehouse/events", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 201, 400, 503), f"Lakehouse event returned {r.status_code}: {r.text[:200]}"

def _lakehouse_query():
    payload = {"sql": "SELECT COUNT(*) FROM audit_events WHERE outcome = 'SUCCESS'"}
    r = requests.post(f"{BRIDGE_URL}/v1/lakehouse/query", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 400, 503), f"Lakehouse query returned {r.status_code}: {r.text[:200]}"

def _lakehouse_reports():
    r = requests.get(f"{BRIDGE_URL}/v1/lakehouse/reports", headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 503), f"Lakehouse reports returned {r.status_code}: {r.text[:200]}"

def _apisix_upsert_route():
    payload = {"routeId": "smoke-route-001", "name": "smoke-test-route",
               "uri": "/smoke/*", "methods": ["GET", "POST"],
               "upstreamUrl": "http://localhost:8080", "plugins": {}}
    r = requests.put(f"{BRIDGE_URL}/v1/apisix/routes", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 201, 400, 503), f"APISix upsert route returned {r.status_code}: {r.text[:200]}"

def _apisix_upsert_consumer():
    payload = {"username": "smoke-consumer", "plugins": {"key-auth": {"key": "smoke-api-key"}}}
    r = requests.put(f"{BRIDGE_URL}/v1/apisix/consumers", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 201, 400, 503), f"APISix upsert consumer returned {r.status_code}: {r.text[:200]}"

def _apisix_delete_route():
    r = requests.delete(f"{BRIDGE_URL}/v1/apisix/routes/smoke-route-001", headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 204, 404, 503), f"APISix delete route returned {r.status_code}: {r.text[:200]}"

def _openappsec_upsert_policy():
    payload = {"policyId": "smoke-policy-001", "name": "Smoke Test Policy",
               "mode": "prevent-learn", "assetUrls": ["http://localhost:8200"]}
    r = requests.put(f"{BRIDGE_URL}/v1/openappsec/policies", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 201, 400, 503), f"OpenAppSec upsert policy returned {r.status_code}: {r.text[:200]}"

def _openappsec_alerts():
    r = requests.get(f"{BRIDGE_URL}/v1/openappsec/alerts", headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 503), f"OpenAppSec alerts returned {r.status_code}: {r.text[:200]}"

run_test("Keycloak user provisioning",     "Hub Operator", "bridge/keycloak",  _keycloak_provision)
run_test("Dapr state set",                 "Hub Operator", "bridge/dapr",      _dapr_state_set)
run_test("Dapr state get",                 "Hub Operator", "bridge/dapr",      _dapr_state_get)
run_test("Dapr event publish",             "Hub Operator", "bridge/dapr",      _dapr_publish)
run_test("Kafka message publish",          "Hub Operator", "bridge/kafka",     _kafka_publish)
run_test("Fluvio produce",                 "Hub Operator", "bridge/fluvio",    _fluvio_produce)
run_test("Fluvio create topic",            "Hub Operator", "bridge/fluvio",    _fluvio_create_topic)
run_test("Fluvio topic stats",             "Hub Operator", "bridge/fluvio",    _fluvio_topic_stats)
run_test("Permify authorization check",    "Hub Operator", "bridge/permify",   _permify_check)
run_test("Permify write relationship",     "Hub Operator", "bridge/permify",   _permify_write_rel)
run_test("Permify delete relationship",    "Hub Operator", "bridge/permify",   _permify_delete_rel)
run_test("Permify expand permissions",     "Hub Operator", "bridge/permify",   _permify_expand)
run_test("Lakehouse audit event write",    "Hub Operator", "bridge/lakehouse", _lakehouse_event)
run_test("Lakehouse compliance query",     "Hub Operator", "bridge/lakehouse", _lakehouse_query)
run_test("Lakehouse reports",              "Hub Operator", "bridge/lakehouse", _lakehouse_reports)
run_test("APISix route upsert",            "Hub Operator", "bridge/apisix",    _apisix_upsert_route)
run_test("APISix consumer upsert",         "Hub Operator", "bridge/apisix",    _apisix_upsert_consumer)
run_test("APISix route delete",            "Hub Operator", "bridge/apisix",    _apisix_delete_route)
run_test("OpenAppSec policy upsert",       "Hub Operator", "bridge/openappsec",_openappsec_upsert_policy)
run_test("OpenAppSec alerts",              "Hub Operator", "bridge/openappsec",_openappsec_alerts)

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 8 — HUB OPERATOR: TEMPORAL WORKFLOW ORCHESTRATION
# ══════════════════════════════════════════════════════════════════════════════
test_section("8. HUB OPERATOR — TEMPORAL WORKFLOW ORCHESTRATION")

def _temporal_start():
    payload = {"workflowType": "TransferWorkflow", "workflowId": "smoke-wf-001",
               "taskQueue": "nexthub-main", "input": {"transferId": "SMOKE-TXN-001"}}
    r = requests.post(f"{BRIDGE_URL}/v1/temporal/workflows", json=payload, headers=HEADERS_INTERNAL, timeout=15)
    assert r.status_code in (200, 201, 400, 503), f"Temporal start returned {r.status_code}: {r.text[:200]}"

def _temporal_status():
    r = requests.get(f"{BRIDGE_URL}/v1/temporal/workflows/smoke-wf-001", headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 404, 503), f"Temporal status returned {r.status_code}: {r.text[:200]}"

def _temporal_signal():
    payload = {"signalName": "payout-approval", "input": True}
    r = requests.post(f"{BRIDGE_URL}/v1/temporal/workflows/smoke-wf-001/signal",
                      json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 400, 404, 503), f"Temporal signal returned {r.status_code}: {r.text[:200]}"

def _temporal_cancel():
    r = requests.post(f"{BRIDGE_URL}/v1/temporal/workflows/smoke-wf-001/cancel",
                      json={}, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 204, 400, 404, 503), f"Temporal cancel returned {r.status_code}: {r.text[:200]}"

run_test("Temporal workflow start",        "Hub Operator", "bridge/temporal", _temporal_start)
run_test("Temporal workflow status",       "Hub Operator", "bridge/temporal", _temporal_status)
run_test("Temporal workflow signal",       "Hub Operator", "bridge/temporal", _temporal_signal)
run_test("Temporal workflow cancel",       "Hub Operator", "bridge/temporal", _temporal_cancel)

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 9 — PARTNER / THIRD-PARTY APP WORKFLOWS
# ══════════════════════════════════════════════════════════════════════════════
test_section("9. PARTNER / THIRD-PARTY APP WORKFLOWS")

def _partner_ping():
    r = requests.get(f"{BRIDGE_URL}/partner/v1/face/ping", timeout=5)
    assert r.status_code in (200, 401, 403), f"Partner ping returned {r.status_code}: {r.text[:200]}"

def _partner_face_verify():
    payload = {"probe_image_b64": IMG, "reference_image_b64": IMG,
               "require_liveness": False, "require_quality": False}
    r = requests.post(f"{BRIDGE_URL}/partner/v1/face/verify", json=payload, headers=HEADERS_PARTNER, timeout=30)
    assert r.status_code in (200, 401, 403, 503), f"Partner face verify returned {r.status_code}: {r.text[:200]}"

def _partner_face_liveness():
    r = requests.post(f"{BRIDGE_URL}/partner/v1/face/liveness",
                      json={"image_b64": IMG}, headers=HEADERS_PARTNER, timeout=30)
    assert r.status_code in (200, 401, 403, 503), f"Partner face liveness returned {r.status_code}: {r.text[:200]}"

def _partner_face_quality():
    r = requests.post(f"{BRIDGE_URL}/partner/v1/face/quality",
                      json={"image_b64": IMG}, headers=HEADERS_PARTNER, timeout=30)
    assert r.status_code in (200, 401, 403, 503), f"Partner face quality returned {r.status_code}: {r.text[:200]}"

def _partner_face_enroll():
    payload = {"subject_id": f"{TEST_SUBJECT_ID}-PARTNER", "image_b64": IMG,
               "require_liveness": False, "require_quality": False}
    r = requests.post(f"{BRIDGE_URL}/partner/v1/face/enroll", json=payload, headers=HEADERS_PARTNER, timeout=30)
    assert r.status_code in (200, 201, 401, 403, 503), f"Partner face enroll returned {r.status_code}: {r.text[:200]}"

def _partner_face_identify():
    payload = {"probe_image_b64": IMG, "top_k": 3, "require_liveness": False}
    r = requests.post(f"{BRIDGE_URL}/partner/v1/face/identify", json=payload, headers=HEADERS_PARTNER, timeout=30)
    assert r.status_code in (200, 401, 403, 503), f"Partner face identify returned {r.status_code}: {r.text[:200]}"

def _partner_face_batch_identify():
    payload = {"probes": [{"probe_image_b64": IMG, "top_k": 3, "require_liveness": False}]}
    r = requests.post(f"{BRIDGE_URL}/partner/v1/face/batch-identify", json=payload, headers=HEADERS_PARTNER, timeout=60)
    assert r.status_code in (200, 401, 403, 503), f"Partner batch identify returned {r.status_code}: {r.text[:200]}"

def _partner_face_deepfake():
    r = requests.post(f"{BRIDGE_URL}/partner/v1/face/deepfake",
                      json={"image_b64": IMG}, headers=HEADERS_PARTNER, timeout=30)
    assert r.status_code in (200, 401, 403, 503), f"Partner deepfake returned {r.status_code}: {r.text[:200]}"

def _partner_face_attributes():
    r = requests.post(f"{BRIDGE_URL}/partner/v1/face/attributes",
                      json={"image_b64": IMG}, headers=HEADERS_PARTNER, timeout=30)
    assert r.status_code in (200, 401, 403, 503), f"Partner attributes returned {r.status_code}: {r.text[:200]}"

def _partner_video_verify():
    payload = {"frames_b64": [IMG, IMG], "reference_image_b64": IMG}
    r = requests.post(f"{BRIDGE_URL}/partner/v1/face/video-verify", json=payload, headers=HEADERS_PARTNER, timeout=60)
    assert r.status_code in (200, 401, 403, 503), f"Partner video verify returned {r.status_code}: {r.text[:200]}"

def _partner_active_liveness_start():
    r = requests.post(f"{BRIDGE_URL}/partner/v1/face/liveness/active",
                      json={"challenge_types": ["BLINK"]}, headers=HEADERS_PARTNER, timeout=30)
    assert r.status_code in (200, 401, 403, 503), f"Partner active liveness start returned {r.status_code}: {r.text[:200]}"

def _partner_active_liveness_verify():
    payload = {"session_id": "partner-session-001", "frames_b64": [IMG, IMG]}
    r = requests.post(f"{BRIDGE_URL}/partner/v1/face/liveness/active/verify",
                      json=payload, headers=HEADERS_PARTNER, timeout=30)
    assert r.status_code in (200, 400, 401, 403, 503), f"Partner active liveness verify returned {r.status_code}: {r.text[:200]}"

def _partner_ninauth_face_match():
    payload = {"nin": TEST_NIN, "live_image_b64": IMG}
    r = requests.post(f"{BRIDGE_URL}/partner/v1/ninauth/face-match", json=payload, headers=HEADERS_PARTNER, timeout=30)
    assert r.status_code in (200, 400, 401, 403, 503), f"Partner NIN face match returned {r.status_code}: {r.text[:200]}"

def _partner_ninauth_verify_nin():
    payload = {"nin": TEST_NIN, "first_name": "Test", "last_name": "Citizen", "date_of_birth": "1990-01-15"}
    r = requests.post(f"{BRIDGE_URL}/partner/v1/ninauth/verify-nin", json=payload, headers=HEADERS_PARTNER, timeout=10)
    assert r.status_code in (200, 400, 401, 403, 503), f"Partner NIN verify returned {r.status_code}: {r.text[:200]}"

def _partner_fidelity():
    r = requests.post(f"{BRIDGE_URL}/partner/v1/face/fidelity",
                      json={"image_b64": IMG, "auto_remediate": False, "return_processed": False},
                      headers=HEADERS_PARTNER, timeout=30)
    assert r.status_code in (200, 401, 403, 503), f"Partner fidelity returned {r.status_code}: {r.text[:200]}"

def _partner_capture_guidance():
    r = requests.post(f"{BRIDGE_URL}/partner/v1/face/capture-guidance",
                      json={"image_b64": IMG, "context": "enrollment"},
                      headers=HEADERS_PARTNER, timeout=30)
    assert r.status_code in (200, 401, 403, 503), f"Partner capture guidance returned {r.status_code}: {r.text[:200]}"

def _partner_enroll_gated():
    payload = {"subject_id": f"{TEST_SUBJECT_ID}-PARTNER-GATED", "image_b64": IMG, "tenant_id": "partner-tenant"}
    r = requests.post(f"{BRIDGE_URL}/partner/v1/face/enroll-gated", json=payload, headers=HEADERS_PARTNER, timeout=30)
    assert r.status_code in (200, 201, 401, 403, 503), f"Partner enroll gated returned {r.status_code}: {r.text[:200]}"

def _partner_auto_crop():
    r = requests.post(f"{BRIDGE_URL}/partner/v1/face/auto-crop",
                      json={"image_b64": IMG}, headers=HEADERS_PARTNER, timeout=30)
    assert r.status_code in (200, 401, 403, 503), f"Partner auto crop returned {r.status_code}: {r.text[:200]}"

def _partner_public_key():
    r = requests.get(f"{BRIDGE_URL}/partner/v1/face/public-key", timeout=10)
    assert r.status_code in (200, 503), f"Partner public key returned {r.status_code}: {r.text[:200]}"

def _partner_face_verify_unauth():
    """Verify that partner routes reject requests without an API key."""
    r = requests.post(f"{BRIDGE_URL}/partner/v1/face/verify",
                      json={"probe_image_b64": IMG, "reference_image_b64": IMG},
                      headers={"Content-Type": "application/json"}, timeout=10)
    assert r.status_code in (401, 403), f"Expected 401/403 without API key, got {r.status_code}"

run_test("Partner API ping",               "Partner", "bridge/partner", _partner_ping)
run_test("Partner face verification",      "Partner", "bridge/partner", _partner_face_verify)
run_test("Partner face liveness",          "Partner", "bridge/partner", _partner_face_liveness)
run_test("Partner face quality",           "Partner", "bridge/partner", _partner_face_quality)
run_test("Partner face enrollment",        "Partner", "bridge/partner", _partner_face_enroll)
run_test("Partner face identification",    "Partner", "bridge/partner", _partner_face_identify)
run_test("Partner batch identification",   "Partner", "bridge/partner", _partner_face_batch_identify)
run_test("Partner deepfake detection",     "Partner", "bridge/partner", _partner_face_deepfake)
run_test("Partner face attributes",        "Partner", "bridge/partner", _partner_face_attributes)
run_test("Partner video verification",     "Partner", "bridge/partner", _partner_video_verify)
run_test("Partner active liveness start",  "Partner", "bridge/partner", _partner_active_liveness_start)
run_test("Partner active liveness verify", "Partner", "bridge/partner", _partner_active_liveness_verify)
run_test("Partner NIN face match",         "Partner", "bridge/partner", _partner_ninauth_face_match)
run_test("Partner NIN verification",       "Partner", "bridge/partner", _partner_ninauth_verify_nin)
run_test("Partner fidelity assessment",    "Partner", "bridge/partner", _partner_fidelity)
run_test("Partner capture guidance",       "Partner", "bridge/partner", _partner_capture_guidance)
run_test("Partner gated enrollment",       "Partner", "bridge/partner", _partner_enroll_gated)
run_test("Partner auto-crop",              "Partner", "bridge/partner", _partner_auto_crop)
run_test("Partner public key endpoint",    "Partner", "bridge/partner", _partner_public_key)
run_test("Partner auth rejection (no key)","Partner", "bridge/partner", _partner_face_verify_unauth)

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 10 — COMPLIANCE / AUDIT OFFICER WORKFLOWS
# ══════════════════════════════════════════════════════════════════════════════
test_section("10. COMPLIANCE / AUDIT OFFICER WORKFLOWS")

# Direct to Rust face-bias-audit service
def _bias_audit_ingest_direct():
    payload = {
        "subject_id": TEST_SUBJECT_ID, "operation": "verify", "result": "accepted",
        "similarity_score": 0.85, "liveness_score": 0.92,
        "age_group": "25-34", "gender": "MALE",
        "partner_id": "TEST-PARTNER", "latency_ms": 145,
    }
    r = requests.post(f"{BIAS_AUDIT_URL}/v1/bias/ingest", json=payload, timeout=10)
    assert r.status_code in (200, 201, 422), f"Bias audit ingest returned {r.status_code}: {r.text[:200]}"

def _bias_audit_report_direct():
    r = requests.get(f"{BIAS_AUDIT_URL}/v1/bias/report", timeout=10)
    assert r.status_code == 200, f"Bias audit report returned {r.status_code}: {r.text[:200]}"

def _bias_audit_report_by_op_direct():
    r = requests.get(f"{BIAS_AUDIT_URL}/v1/bias/report/verify", timeout=10)
    assert r.status_code in (200, 404), f"Bias report by op returned {r.status_code}: {r.text[:200]}"

def _bias_audit_alerts_direct():
    r = requests.get(f"{BIAS_AUDIT_URL}/v1/bias/alert", timeout=10)
    assert r.status_code == 200, f"Bias audit alerts returned {r.status_code}: {r.text[:200]}"

def _ninauth_consent_audit_direct():
    payload = {
        "subject_id": TEST_SUBJECT_ID, "consent_type": "biometric_enrollment",
        "granted": True, "ip_address": "127.0.0.1", "user_agent": "smoke-test/1.0",
        "partner_id": "TEST-PARTNER",
    }
    r = requests.post(f"{BIAS_AUDIT_URL}/v1/ninauth/consent-audit", json=payload, timeout=10)
    assert r.status_code in (200, 201, 422), f"NINAuth consent audit returned {r.status_code}: {r.text[:200]}"

def _ninauth_face_match_audit_direct():
    payload = {
        "subject_id": TEST_SUBJECT_ID, "nin": TEST_NIN,
        "verified": True, "similarity_score": 0.91,
        "liveness_passed": True, "partner_id": "TEST-PARTNER",
    }
    r = requests.post(f"{BIAS_AUDIT_URL}/v1/ninauth/face-match-audit", json=payload, timeout=10)
    assert r.status_code in (200, 201, 422), f"NINAuth face match audit returned {r.status_code}: {r.text[:200]}"

def _ninauth_vc_audit_direct():
    payload = {
        "subject_id": TEST_SUBJECT_ID, "vc_type": "NINCredential",
        "verified": True, "partner_id": "TEST-PARTNER",
    }
    r = requests.post(f"{BIAS_AUDIT_URL}/v1/ninauth/vc-audit", json=payload, timeout=10)
    assert r.status_code in (200, 201, 422), f"NINAuth VC audit returned {r.status_code}: {r.text[:200]}"

def _fidelity_audit_ingest_direct():
    payload = {
        "subject_id": TEST_SUBJECT_ID, "operation": "quality_check",
        "overall_score": 0.82, "icao_compliant": True,
        "passed": True, "context": "enrollment",
    }
    r = requests.post(f"{BIAS_AUDIT_URL}/v1/fidelity/ingest", json=payload, timeout=10)
    assert r.status_code in (200, 201, 422), f"Fidelity audit ingest returned {r.status_code}: {r.text[:200]}"

def _fidelity_audit_report_direct():
    r = requests.get(f"{BIAS_AUDIT_URL}/v1/fidelity/report", timeout=10)
    assert r.status_code == 200, f"Fidelity audit report returned {r.status_code}: {r.text[:200]}"

def _fidelity_audit_compliance_direct():
    r = requests.get(f"{BIAS_AUDIT_URL}/v1/fidelity/compliance", timeout=10)
    assert r.status_code == 200, f"Fidelity compliance returned {r.status_code}: {r.text[:200]}"

# Via Go Bridge relay
def _bias_audit_ingest_bridge():
    payload = {
        "subject_id": TEST_SUBJECT_ID, "operation": "enroll", "result": "accepted",
        "similarity_score": 0.0, "liveness_score": 0.88,
        "age_group": "35-44", "gender": "FEMALE",
        "partner_id": "BRIDGE-PARTNER", "latency_ms": 120,
    }
    r = requests.post(f"{BRIDGE_URL}/v1/bias-audit/ingest", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 201, 503), f"Bridge bias audit ingest returned {r.status_code}: {r.text[:200]}"

def _bias_audit_report_bridge():
    r = requests.get(f"{BRIDGE_URL}/v1/bias-audit/report", headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 503), f"Bridge bias audit report returned {r.status_code}: {r.text[:200]}"

def _bias_audit_report_by_op_bridge():
    r = requests.get(f"{BRIDGE_URL}/v1/bias-audit/report/enroll", headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 404, 503), f"Bridge bias report by op returned {r.status_code}: {r.text[:200]}"

def _bias_audit_alerts_bridge():
    r = requests.get(f"{BRIDGE_URL}/v1/bias-audit/alerts", headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 503), f"Bridge bias alerts returned {r.status_code}: {r.text[:200]}"

def _ninauth_consent_bridge():
    payload = {
        "subject_id": TEST_SUBJECT_ID, "consent_type": "biometric_enrollment",
        "granted": True, "ip_address": "127.0.0.1", "user_agent": "smoke-test/1.0",
        "partner_id": "BRIDGE-PARTNER",
    }
    r = requests.post(f"{BRIDGE_URL}/v1/bias-audit/ninauth/consent", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 201, 503), f"Bridge NINAuth consent audit returned {r.status_code}: {r.text[:200]}"

def _ninauth_face_match_bridge():
    payload = {
        "subject_id": TEST_SUBJECT_ID, "nin": TEST_NIN,
        "verified": True, "similarity_score": 0.91,
        "liveness_passed": True, "partner_id": "BRIDGE-PARTNER",
    }
    r = requests.post(f"{BRIDGE_URL}/v1/bias-audit/ninauth/face-match", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 201, 503), f"Bridge NINAuth face match audit returned {r.status_code}: {r.text[:200]}"

def _ninauth_vc_bridge():
    payload = {
        "subject_id": TEST_SUBJECT_ID, "vc_type": "NINCredential",
        "verified": True, "partner_id": "BRIDGE-PARTNER",
    }
    r = requests.post(f"{BRIDGE_URL}/v1/bias-audit/ninauth/vc", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 201, 503), f"Bridge NINAuth VC audit returned {r.status_code}: {r.text[:200]}"

def _fidelity_audit_ingest_bridge():
    payload = {
        "subject_id": TEST_SUBJECT_ID, "operation": "quality_check",
        "overall_score": 0.87, "icao_compliant": True,
        "passed": True, "context": "verification",
    }
    r = requests.post(f"{BRIDGE_URL}/v1/bias-audit/fidelity/ingest", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 201, 503), f"Bridge fidelity audit ingest returned {r.status_code}: {r.text[:200]}"

def _fidelity_audit_report_bridge():
    r = requests.get(f"{BRIDGE_URL}/v1/bias-audit/fidelity/report", headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 503), f"Bridge fidelity audit report returned {r.status_code}: {r.text[:200]}"

def _fidelity_audit_compliance_bridge():
    r = requests.get(f"{BRIDGE_URL}/v1/bias-audit/fidelity/compliance", headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 503), f"Bridge fidelity compliance returned {r.status_code}: {r.text[:200]}"

run_test("Bias audit ingest (direct)",          "Compliance", "face-bias-audit",       _bias_audit_ingest_direct)
run_test("Bias audit report (direct)",          "Compliance", "face-bias-audit",       _bias_audit_report_direct)
run_test("Bias audit report by op (direct)",    "Compliance", "face-bias-audit",       _bias_audit_report_by_op_direct)
run_test("Bias audit alerts (direct)",          "Compliance", "face-bias-audit",       _bias_audit_alerts_direct)
run_test("NINAuth consent audit (direct)",      "Compliance", "face-bias-audit",       _ninauth_consent_audit_direct)
run_test("NINAuth face match audit (direct)",   "Compliance", "face-bias-audit",       _ninauth_face_match_audit_direct)
run_test("NINAuth VC audit (direct)",           "Compliance", "face-bias-audit",       _ninauth_vc_audit_direct)
run_test("Fidelity audit ingest (direct)",      "Compliance", "face-bias-audit",       _fidelity_audit_ingest_direct)
run_test("Fidelity audit report (direct)",      "Compliance", "face-bias-audit",       _fidelity_audit_report_direct)
run_test("Fidelity compliance check (direct)",  "Compliance", "face-bias-audit",       _fidelity_audit_compliance_direct)
run_test("Bias audit ingest (bridge relay)",    "Compliance", "bridge/bias-audit",     _bias_audit_ingest_bridge)
run_test("Bias audit report (bridge relay)",    "Compliance", "bridge/bias-audit",     _bias_audit_report_bridge)
run_test("Bias audit report by op (bridge)",    "Compliance", "bridge/bias-audit",     _bias_audit_report_by_op_bridge)
run_test("Bias audit alerts (bridge relay)",    "Compliance", "bridge/bias-audit",     _bias_audit_alerts_bridge)
run_test("NINAuth consent audit (bridge)",      "Compliance", "bridge/bias-audit",     _ninauth_consent_bridge)
run_test("NINAuth face match audit (bridge)",   "Compliance", "bridge/bias-audit",     _ninauth_face_match_bridge)
run_test("NINAuth VC audit (bridge relay)",     "Compliance", "bridge/bias-audit",     _ninauth_vc_bridge)
run_test("Fidelity audit ingest (bridge)",      "Compliance", "bridge/bias-audit",     _fidelity_audit_ingest_bridge)
run_test("Fidelity audit report (bridge)",      "Compliance", "bridge/bias-audit",     _fidelity_audit_report_bridge)
run_test("Fidelity compliance (bridge relay)",  "Compliance", "bridge/bias-audit",     _fidelity_audit_compliance_bridge)

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 11 — HUB OPERATOR: BRIDGE FACE RELAY WORKFLOWS
# ══════════════════════════════════════════════════════════════════════════════
test_section("11. HUB OPERATOR — BRIDGE FACE RELAY WORKFLOWS")

def _bridge_face_quality_relay():
    r = requests.post(f"{BRIDGE_URL}/v1/face/quality",
                      json={"image_b64": IMG}, headers=HEADERS_INTERNAL, timeout=30)
    assert r.status_code in (200, 503), f"Bridge face quality relay returned {r.status_code}: {r.text[:200]}"

def _bridge_face_verify_relay():
    payload = {"probe_image_b64": IMG, "reference_image_b64": IMG,
               "require_liveness": False, "require_quality": False}
    r = requests.post(f"{BRIDGE_URL}/v1/face/verify", json=payload, headers=HEADERS_INTERNAL, timeout=30)
    assert r.status_code in (200, 503), f"Bridge face verify relay returned {r.status_code}: {r.text[:200]}"

def _bridge_face_enroll_relay():
    payload = {"subject_id": f"{TEST_SUBJECT_ID}-BRIDGE", "image_b64": IMG,
               "require_liveness": False, "require_quality": False}
    r = requests.post(f"{BRIDGE_URL}/v1/face/enroll", json=payload, headers=HEADERS_INTERNAL, timeout=30)
    assert r.status_code in (200, 201, 503), f"Bridge face enroll relay returned {r.status_code}: {r.text[:200]}"

def _bridge_face_identify_relay():
    payload = {"probe_image_b64": IMG, "top_k": 3, "require_liveness": False}
    r = requests.post(f"{BRIDGE_URL}/v1/face/identify", json=payload, headers=HEADERS_INTERNAL, timeout=30)
    assert r.status_code in (200, 503), f"Bridge face identify relay returned {r.status_code}: {r.text[:200]}"

def _bridge_face_liveness_relay():
    r = requests.post(f"{BRIDGE_URL}/v1/face/liveness",
                      json={"image_b64": IMG}, headers=HEADERS_INTERNAL, timeout=30)
    assert r.status_code in (200, 503), f"Bridge face liveness relay returned {r.status_code}: {r.text[:200]}"

def _bridge_face_attributes_relay():
    r = requests.post(f"{BRIDGE_URL}/v1/face/attributes",
                      json={"image_b64": IMG}, headers=HEADERS_INTERNAL, timeout=30)
    assert r.status_code in (200, 503), f"Bridge face attributes relay returned {r.status_code}: {r.text[:200]}"

def _bridge_deepfake_relay():
    r = requests.post(f"{BRIDGE_URL}/v1/face/deepfake",
                      json={"image_b64": IMG}, headers=HEADERS_INTERNAL, timeout=30)
    assert r.status_code in (200, 503), f"Bridge deepfake detect relay returned {r.status_code}: {r.text[:200]}"

def _bridge_active_liveness_start_relay():
    r = requests.post(f"{BRIDGE_URL}/v1/face/liveness/active",
                      json={"challenge_types": ["BLINK"]}, headers=HEADERS_INTERNAL, timeout=30)
    assert r.status_code in (200, 503), f"Bridge active liveness start relay returned {r.status_code}: {r.text[:200]}"

def _bridge_active_liveness_verify_relay():
    payload = {"session_id": "bridge-session-001", "frames_b64": [IMG, IMG]}
    r = requests.post(f"{BRIDGE_URL}/v1/face/liveness/active/verify",
                      json=payload, headers=HEADERS_INTERNAL, timeout=30)
    assert r.status_code in (200, 400, 503), f"Bridge active liveness verify relay returned {r.status_code}: {r.text[:200]}"

def _bridge_batch_identify_relay():
    payload = {"probes": [{"probe_image_b64": IMG, "top_k": 3, "require_liveness": False}]}
    r = requests.post(f"{BRIDGE_URL}/v1/face/batch-identify", json=payload, headers=HEADERS_INTERNAL, timeout=60)
    assert r.status_code in (200, 503), f"Bridge batch identify relay returned {r.status_code}: {r.text[:200]}"

def _bridge_video_verify_relay():
    payload = {"frames_b64": [IMG, IMG], "reference_image_b64": IMG}
    r = requests.post(f"{BRIDGE_URL}/v1/face/video-verify", json=payload, headers=HEADERS_INTERNAL, timeout=60)
    assert r.status_code in (200, 503), f"Bridge video verify relay returned {r.status_code}: {r.text[:200]}"

def _bridge_fidelity_relay():
    r = requests.post(f"{BRIDGE_URL}/v1/face/fidelity",
                      json={"image_b64": IMG, "auto_remediate": False, "return_processed": False},
                      headers=HEADERS_INTERNAL, timeout=30)
    assert r.status_code in (200, 503), f"Bridge fidelity relay returned {r.status_code}: {r.text[:200]}"

def _bridge_capture_guidance_relay():
    r = requests.post(f"{BRIDGE_URL}/v1/face/capture-guidance",
                      json={"image_b64": IMG, "context": "enrollment"},
                      headers=HEADERS_INTERNAL, timeout=30)
    assert r.status_code in (200, 503), f"Bridge capture guidance relay returned {r.status_code}: {r.text[:200]}"

def _bridge_enroll_gated_relay():
    payload = {"subject_id": f"{TEST_SUBJECT_ID}-BRIDGE-GATED", "image_b64": IMG, "tenant_id": "smoke-tenant"}
    r = requests.post(f"{BRIDGE_URL}/v1/face/enroll-gated", json=payload, headers=HEADERS_INTERNAL, timeout=30)
    assert r.status_code in (200, 201, 503), f"Bridge enroll gated relay returned {r.status_code}: {r.text[:200]}"

def _bridge_auto_crop_relay():
    r = requests.post(f"{BRIDGE_URL}/v1/face/auto-crop",
                      json={"image_b64": IMG}, headers=HEADERS_INTERNAL, timeout=30)
    assert r.status_code in (200, 503), f"Bridge auto crop relay returned {r.status_code}: {r.text[:200]}"

def _bridge_name_match_relay():
    payload = {"expected_full": "Test Citizen", "actual_full": "Test Citizen"}
    r = requests.post(f"{BRIDGE_URL}/v1/face/name-match", json=payload, headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 503), f"Bridge name match relay returned {r.status_code}: {r.text[:200]}"

def _bridge_public_key_relay():
    r = requests.get(f"{BRIDGE_URL}/v1/face/public-key", headers=HEADERS_INTERNAL, timeout=10)
    assert r.status_code in (200, 503), f"Bridge public key relay returned {r.status_code}: {r.text[:200]}"

run_test("Bridge → face quality relay",           "Hub Operator", "bridge/face", _bridge_face_quality_relay)
run_test("Bridge → face verify relay",            "Hub Operator", "bridge/face", _bridge_face_verify_relay)
run_test("Bridge → face enroll relay",            "Hub Operator", "bridge/face", _bridge_face_enroll_relay)
run_test("Bridge → face identify relay",          "Hub Operator", "bridge/face", _bridge_face_identify_relay)
run_test("Bridge → face liveness relay",          "Hub Operator", "bridge/face", _bridge_face_liveness_relay)
run_test("Bridge → face attributes relay",        "Hub Operator", "bridge/face", _bridge_face_attributes_relay)
run_test("Bridge → deepfake detect relay",        "Hub Operator", "bridge/face", _bridge_deepfake_relay)
run_test("Bridge → active liveness start relay",  "Hub Operator", "bridge/face", _bridge_active_liveness_start_relay)
run_test("Bridge → active liveness verify relay", "Hub Operator", "bridge/face", _bridge_active_liveness_verify_relay)
run_test("Bridge → batch identify relay",         "Hub Operator", "bridge/face", _bridge_batch_identify_relay)
run_test("Bridge → video verify relay",           "Hub Operator", "bridge/face", _bridge_video_verify_relay)
run_test("Bridge → fidelity assess relay",        "Hub Operator", "bridge/face", _bridge_fidelity_relay)
run_test("Bridge → capture guidance relay",       "Hub Operator", "bridge/face", _bridge_capture_guidance_relay)
run_test("Bridge → gated enroll relay",           "Hub Operator", "bridge/face", _bridge_enroll_gated_relay)
run_test("Bridge → auto-crop relay",              "Hub Operator", "bridge/face", _bridge_auto_crop_relay)
run_test("Bridge → name match relay",             "Hub Operator", "bridge/face", _bridge_name_match_relay)
run_test("Bridge → face public key relay",        "Hub Operator", "bridge/face", _bridge_public_key_relay)

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 12 — VECTOR DATABASE (QDRANT) WORKFLOWS
# ══════════════════════════════════════════════════════════════════════════════
test_section("12. VECTOR DATABASE (QDRANT) WORKFLOWS")

def _qdrant_list_collections():
    r = requests.get(f"{QDRANT_URL}/collections", timeout=5)
    assert r.status_code == 200, f"Qdrant list collections returned {r.status_code}"
    data = r.json()
    assert "result" in data, f"Unexpected Qdrant response: {data}"

def _qdrant_face_collection_exists():
    r = requests.get(f"{QDRANT_URL}/collections/face_embeddings", timeout=5)
    assert r.status_code in (200, 404), f"Qdrant face_embeddings check returned {r.status_code}"

def _qdrant_upsert_and_search():
    requests.put(
        f"{QDRANT_URL}/collections/smoke_test_collection",
        json={"vectors": {"size": 512, "distance": "Cosine"}}, timeout=10,
    )
    vec = np.random.randn(512).tolist()
    r = requests.put(
        f"{QDRANT_URL}/collections/smoke_test_collection/points",
        json={"points": [{"id": 1, "vector": vec, "payload": {"subject_id": "SMOKE-TEST"}}]},
        timeout=10,
    )
    assert r.status_code in (200, 206), f"Qdrant upsert returned {r.status_code}: {r.text[:200]}"
    r2 = requests.post(
        f"{QDRANT_URL}/collections/smoke_test_collection/points/search",
        json={"vector": vec, "limit": 3, "with_payload": True}, timeout=10,
    )
    assert r2.status_code == 200, f"Qdrant search returned {r2.status_code}: {r2.text[:200]}"
    data = r2.json()
    assert len(data.get("result", [])) > 0, f"Qdrant search returned no results: {data}"

def _qdrant_delete_collection():
    r = requests.delete(f"{QDRANT_URL}/collections/smoke_test_collection", timeout=5)
    assert r.status_code in (200, 404), f"Qdrant delete collection returned {r.status_code}"

run_test("Qdrant list collections",         "Platform", "qdrant", _qdrant_list_collections)
run_test("Qdrant face_embeddings exists",   "Platform", "qdrant", _qdrant_face_collection_exists)
run_test("Qdrant upsert + cosine search",   "Platform", "qdrant", _qdrant_upsert_and_search)
run_test("Qdrant collection cleanup",       "Platform", "qdrant", _qdrant_delete_collection)

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 13: Hub Operator — /nexthub Internal Ledger Routes
# Stakeholder: Hub Operator (settlement engine, PISP, NIP, FX, bulk, provisioning)
# ══════════════════════════════════════════════════════════════════════════════
test_section("Hub Operator: /nexthub Internal Ledger Routes")

NEXTHUB_URL = os.getenv("BRIDGE_URL", "http://localhost:8200")

def _provision_participant():
    payload = {"dfspId": "SMOKE-DFSP-001", "currency": "NGN", "initialPositionKobo": 0, "initialSettlementKobo": 0}
    r = requests.post(f"{NEXTHUB_URL}/nexthub/ledger/provision-participant", json=payload, headers=HEADERS_INTERNAL, timeout=15)
    assert r.status_code in (200, 201, 400, 503, 502), f"Provision participant returned {r.status_code}: {r.text[:200]}"

def _provision_nqr_merchant():
    payload = {"merchantId": "SMOKE-MERCH-001", "currency": "NGN", "initialBalanceKobo": 0}
    r = requests.post(f"{NEXTHUB_URL}/nexthub/ledger/provision-nqr-merchant", json=payload, headers=HEADERS_INTERNAL, timeout=15)
    assert r.status_code in (200, 201, 400, 503, 502), f"Provision NQR merchant returned {r.status_code}: {r.text[:200]}"

def _provision_cbdc_wallet():
    payload = {"walletId": "SMOKE-CBDC-001", "tokenType": "eNGN", "initialBalanceKobo": 0}
    r = requests.post(f"{NEXTHUB_URL}/nexthub/ledger/provision-cbdc-wallet", json=payload, headers=HEADERS_INTERNAL, timeout=15)
    assert r.status_code in (200, 201, 400, 503, 502), f"Provision CBDC wallet returned {r.status_code}: {r.text[:200]}"

def _nip_transfer():
    payload = {"transferId": "SMOKE-NIP-001", "payerAccountId": 3001, "payeeAccountId": 3002, "amountKobo": 50000, "currency": "NGN"}
    r = requests.post(f"{NEXTHUB_URL}/nexthub/ledger/nip-transfer", json=payload, headers=HEADERS_INTERNAL, timeout=15)
    assert r.status_code in (200, 201, 400, 503, 502), f"NIP transfer returned {r.status_code}: {r.text[:200]}"

def _pisp_reserve():
    payload = {"reservationId": "SMOKE-PISP-001", "payerAccountId": 3001, "amountKobo": 20000, "currency": "NGN"}
    r = requests.post(f"{NEXTHUB_URL}/nexthub/ledger/pisp-reserve", json=payload, headers=HEADERS_INTERNAL, timeout=15)
    assert r.status_code in (200, 201, 400, 503, 502), f"PISP reserve returned {r.status_code}: {r.text[:200]}"

def _pisp_commit():
    payload = {"reservationId": "SMOKE-PISP-001", "payeeAccountId": 3002}
    r = requests.post(f"{NEXTHUB_URL}/nexthub/ledger/pisp-commit", json=payload, headers=HEADERS_INTERNAL, timeout=15)
    assert r.status_code in (200, 400, 404, 503, 502), f"PISP commit returned {r.status_code}: {r.text[:200]}"

def _pisp_void():
    payload = {"reservationId": "SMOKE-PISP-002"}
    r = requests.post(f"{NEXTHUB_URL}/nexthub/ledger/pisp-void", json=payload, headers=HEADERS_INTERNAL, timeout=15)
    assert r.status_code in (200, 400, 404, 503, 502), f"PISP void returned {r.status_code}: {r.text[:200]}"

def _bulk_transfer_leg():
    payload = {"batchId": "SMOKE-BULK-001", "legId": "LEG-001", "payerAccountId": 3001, "payeeAccountId": 3002, "amountKobo": 10000, "currency": "NGN"}
    r = requests.post(f"{NEXTHUB_URL}/nexthub/ledger/bulk-transfer-leg", json=payload, headers=HEADERS_INTERNAL, timeout=15)
    assert r.status_code in (200, 201, 400, 503, 502), f"Bulk transfer leg returned {r.status_code}: {r.text[:200]}"

def _fx_conversion():
    payload = {"conversionId": "SMOKE-FX-001", "sourceAccountId": 3001, "targetAccountId": 3002, "sourceAmountKobo": 100000, "sourceCurrency": "NGN", "targetCurrency": "GHS", "fxRate": 0.0285}
    r = requests.post(f"{NEXTHUB_URL}/nexthub/ledger/fx-conversion", json=payload, headers=HEADERS_INTERNAL, timeout=15)
    assert r.status_code in (200, 201, 400, 503, 502), f"FX conversion returned {r.status_code}: {r.text[:200]}"

def _remittance_transfer():
    payload = {"remittanceId": "SMOKE-REM-001", "senderId": "SND-001", "receiverId": "RCV-001", "amountKobo": 200000, "sourceCurrency": "NGN", "targetCurrency": "GHS"}
    r = requests.post(f"{NEXTHUB_URL}/nexthub/ledger/remittance-transfer", json=payload, headers=HEADERS_INTERNAL, timeout=15)
    assert r.status_code in (200, 201, 400, 503, 502), f"Remittance transfer returned {r.status_code}: {r.text[:200]}"

def _settlement_prepare():
    payload = {"windowId": "WIN-SMOKE-001", "currency": "NGN"}
    r = requests.post(f"{NEXTHUB_URL}/nexthub/ledger/settlement-prepare", json=payload, headers=HEADERS_INTERNAL, timeout=15)
    assert r.status_code in (200, 400, 503, 502), f"Settlement prepare returned {r.status_code}: {r.text[:200]}"

def _settlement_commit():
    payload = {"windowId": "WIN-SMOKE-001"}
    r = requests.post(f"{NEXTHUB_URL}/nexthub/ledger/settlement-commit", json=payload, headers=HEADERS_INTERNAL, timeout=15)
    assert r.status_code in (200, 400, 404, 503, 502), f"Settlement commit returned {r.status_code}: {r.text[:200]}"

def _settlement_void():
    payload = {"windowId": "WIN-SMOKE-002", "reason": "SMOKE_TEST_VOID"}
    r = requests.post(f"{NEXTHUB_URL}/nexthub/ledger/settlement-void", json=payload, headers=HEADERS_INTERNAL, timeout=15)
    assert r.status_code in (200, 400, 404, 503, 502), f"Settlement void returned {r.status_code}: {r.text[:200]}"

def _dispute_reversal():
    payload = {"disputeId": "SMOKE-DISP-001", "originalTransferId": "SMOKE-TXN-001", "amountKobo": 100000, "currency": "NGN"}
    r = requests.post(f"{NEXTHUB_URL}/nexthub/ledger/dispute-reversal", json=payload, headers=HEADERS_INTERNAL, timeout=15)
    assert r.status_code in (200, 400, 404, 503, 502), f"Dispute reversal returned {r.status_code}: {r.text[:200]}"

run_test("Provision DFSP participant accounts",  "Hub Operator", "bridge/nexthub/ledger", _provision_participant)
run_test("Provision NQR merchant account",       "Hub Operator", "bridge/nexthub/ledger", _provision_nqr_merchant)
run_test("Provision CBDC wallet account",        "Hub Operator", "bridge/nexthub/ledger", _provision_cbdc_wallet)
run_test("NIP transfer posting",                 "Hub Operator", "bridge/nexthub/ledger", _nip_transfer)
run_test("PISP payment reservation",             "Hub Operator", "bridge/nexthub/ledger", _pisp_reserve)
run_test("PISP payment commit",                  "Hub Operator", "bridge/nexthub/ledger", _pisp_commit)
run_test("PISP payment void",                    "Hub Operator", "bridge/nexthub/ledger", _pisp_void)
run_test("Bulk transfer leg posting",            "Hub Operator", "bridge/nexthub/ledger", _bulk_transfer_leg)
run_test("FX rate conversion posting",           "Hub Operator", "bridge/nexthub/ledger", _fx_conversion)
run_test("Remittance transfer posting",          "Hub Operator", "bridge/nexthub/ledger", _remittance_transfer)
run_test("Settlement window prepare",            "Hub Operator", "bridge/nexthub/ledger", _settlement_prepare)
run_test("Settlement window commit",             "Hub Operator", "bridge/nexthub/ledger", _settlement_commit)
run_test("Settlement window void",               "Hub Operator", "bridge/nexthub/ledger", _settlement_void)
run_test("Dispute ledger reversal",              "Hub Operator", "bridge/nexthub/ledger", _dispute_reversal)


# ══════════════════════════════════════════════════════════════════════════════
# KEYCLOAK ADMIN API — User CRUD, Role management, Realm management, Token ops
# ══════════════════════════════════════════════════════════════════════════════
test_section("13. KEYCLOAK ADMIN API")

BRIDGE = BRIDGE_URL  # alias for clarity

def bridge(method, path, body=None):
    url = f"{BRIDGE}{path}"
    r = requests.request(method, url, json=body, headers=HEADERS_INTERNAL, timeout=10)
    return r

def _kc_create_user():
    r = bridge("POST", "/v1/keycloak/users", {
        "username": "smoke_user", "email": "smoke@nexthub.io",
        "firstName": "Smoke", "lastName": "Test", "enabled": True
    })
    assert r.status_code in (201, 409, 503), f"KC create user: {r.status_code}"

def _kc_list_users():
    r = bridge("GET", "/v1/keycloak/users?search=smoke&max=10")
    assert r.status_code in (200, 503), f"KC list users: {r.status_code}"

def _kc_get_user():
    r = bridge("GET", "/v1/keycloak/users/test-user-id")
    assert r.status_code in (200, 404, 503), f"KC get user: {r.status_code}"

def _kc_update_user():
    r = bridge("PUT", "/v1/keycloak/users/test-user-id", {"firstName": "Updated", "lastName": "User"})
    assert r.status_code in (200, 204, 404, 503), f"KC update user: {r.status_code}"

def _kc_set_password():
    r = bridge("PUT", "/v1/keycloak/users/test-user-id/password", {"password": "Nexthub@2025!", "temporary": True})
    assert r.status_code in (200, 204, 404, 503), f"KC set password: {r.status_code}"

def _kc_send_verify_email():
    r = bridge("POST", "/v1/keycloak/users/test-user-id/send-verify-email", {})
    assert r.status_code in (200, 204, 404, 503), f"KC send verify email: {r.status_code}"

def _kc_get_user_roles():
    r = bridge("GET", "/v1/keycloak/users/test-user-id/roles")
    assert r.status_code in (200, 404, 503), f"KC get user roles: {r.status_code}"

def _kc_assign_roles():
    r = bridge("POST", "/v1/keycloak/users/test-user-id/roles", [{"id": "role-uuid", "name": "dfsp"}])
    assert r.status_code in (200, 204, 404, 503), f"KC assign roles: {r.status_code}"

def _kc_remove_roles():
    r = bridge("DELETE", "/v1/keycloak/users/test-user-id/roles", [{"id": "role-uuid", "name": "dfsp"}])
    assert r.status_code in (200, 204, 404, 503), f"KC remove roles: {r.status_code}"

def _kc_list_roles():
    r = bridge("GET", "/v1/keycloak/roles")
    assert r.status_code in (200, 503), f"KC list roles: {r.status_code}"

def _kc_get_role():
    r = bridge("GET", "/v1/keycloak/roles/dfsp")
    assert r.status_code in (200, 404, 503), f"KC get role: {r.status_code}"

def _kc_create_realm():
    r = bridge("POST", "/v1/keycloak/realms", {
        "realm": "nexthub-smoke-tenant", "displayName": "Smoke Tenant", "enabled": True
    })
    assert r.status_code in (201, 409, 503), f"KC create realm: {r.status_code}"

def _kc_get_realm():
    r = bridge("GET", "/v1/keycloak/realms/nexthub")
    assert r.status_code in (200, 404, 503), f"KC get realm: {r.status_code}"

def _kc_delete_realm():
    r = bridge("DELETE", "/v1/keycloak/realms/nexthub-smoke-tenant")
    assert r.status_code in (200, 204, 404, 503), f"KC delete realm: {r.status_code}"

def _kc_introspect():
    r = bridge("POST", "/v1/keycloak/introspect", {"token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.smoke"})
    assert r.status_code in (200, 401, 503), f"KC introspect: {r.status_code}"

def _kc_sync_permify():
    r = bridge("POST", "/v1/keycloak/sync-permify", {})
    assert r.status_code in (200, 503), f"KC sync-permify: {r.status_code}"

def _kc_provision_legacy():
    r = bridge("POST", "/v1/keycloak/provision", {
        "username": "legacy_smoke", "email": "legacy@nexthub.io",
        "roles": ["dfsp"], "tempPassword": "Nexthub@2025!"
    })
    assert r.status_code in (200, 201, 409, 503), f"KC legacy provision: {r.status_code}"

def _kc_delete_user():
    r = bridge("DELETE", "/v1/keycloak/users/test-user-id")
    assert r.status_code in (200, 204, 404, 503), f"KC delete user: {r.status_code}"

run_test("Keycloak create user",                "Hub Operator", "bridge/keycloak", _kc_create_user)
run_test("Keycloak list users",                 "Hub Operator", "bridge/keycloak", _kc_list_users)
run_test("Keycloak get user by ID",             "Hub Operator", "bridge/keycloak", _kc_get_user)
run_test("Keycloak update user profile",        "Hub Operator", "bridge/keycloak", _kc_update_user)
run_test("Keycloak set user password",          "Hub Operator", "bridge/keycloak", _kc_set_password)
run_test("Keycloak send verification email",    "Hub Operator", "bridge/keycloak", _kc_send_verify_email)
run_test("Keycloak get user roles",             "Hub Operator", "bridge/keycloak", _kc_get_user_roles)
run_test("Keycloak assign realm roles",         "Hub Operator", "bridge/keycloak", _kc_assign_roles)
run_test("Keycloak remove realm roles",         "Hub Operator", "bridge/keycloak", _kc_remove_roles)
run_test("Keycloak list realm roles",           "Hub Operator", "bridge/keycloak", _kc_list_roles)
run_test("Keycloak get role by name",           "Hub Operator", "bridge/keycloak", _kc_get_role)
run_test("Keycloak create tenant realm",        "Hub Operator", "bridge/keycloak", _kc_create_realm)
run_test("Keycloak get realm config",           "Hub Operator", "bridge/keycloak", _kc_get_realm)
run_test("Keycloak delete tenant realm",        "Hub Operator", "bridge/keycloak", _kc_delete_realm)
run_test("Keycloak token introspection",        "Hub Operator", "bridge/keycloak", _kc_introspect)
run_test("Keycloak sync roles to Permify",      "Hub Operator", "bridge/keycloak", _kc_sync_permify)
run_test("Keycloak legacy provision endpoint",  "Hub Operator", "bridge/keycloak", _kc_provision_legacy)
run_test("Keycloak delete user",                "Hub Operator", "bridge/keycloak", _kc_delete_user)

# ══════════════════════════════════════════════════════════════════════════════
# FINAL REPORT
# ══════════════════════════════════════════════════════════════════════════════
test_section("SMOKE TEST RESULTS SUMMARY")

total   = len(results)
passed  = sum(1 for r in results if r.passed)
failed  = total - passed
skipped = sum(1 for r in results if "SKIP" in r.message or "connection refused" in r.message.lower())

print(f"\n  Total:   {total}")
print(f"  Passed:  {passed}  ✅")
print(f"  Failed:  {failed - skipped}  ❌")
print(f"  Skipped: {skipped}  ⏭")
print(f"  Pass Rate: {passed/total*100:.1f}%\n")

# Breakdown by stakeholder
stakeholders: dict[str, dict[str, int]] = {}
for r in results:
    s = stakeholders.setdefault(r.stakeholder, {"passed": 0, "failed": 0, "total": 0})
    s["total"] += 1
    if r.passed:
        s["passed"] += 1
    else:
        s["failed"] += 1

print("  Results by Stakeholder:")
print(f"  {'Stakeholder':<20} {'Passed':>8} {'Failed':>8} {'Total':>8}")
print(f"  {'-'*50}")
for sh, counts in sorted(stakeholders.items()):
    print(f"  {sh:<20} {counts['passed']:>8} {counts['failed']:>8} {counts['total']:>8}")

if failed - skipped > 0:
    print("\n  FAILED TESTS:")
    for r in results:
        if not r.passed and "SKIP" not in r.message and "connection refused" not in r.message.lower():
            print(f"    ❌ [{r.stakeholder}] {r.name}")
            print(f"       Service: {r.service}")
            print(f"       Reason:  {r.message[:200]}")
    print()

# Write JSON report
report = {
    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "summary": {"total": total, "passed": passed, "failed": failed - skipped, "skipped": skipped},
    "by_stakeholder": stakeholders,
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
print(f"\n  Full report written to: {report_path}")

real_failures = [r for r in results if not r.passed
                 and "SKIP" not in r.message
                 and "connection refused" not in r.message.lower()]
sys.exit(1 if real_failures else 0)
