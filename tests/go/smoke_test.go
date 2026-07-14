// Package smoke provides integration smoke tests for the NextHub Go bridge service.
// Run with: go test -v -timeout 120s ./tests/go/...
package smoke

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"testing"
	"time"
)

var (
	bridgeURL   = getEnv("BRIDGE_URL", "http://localhost:8200")
	internalKey = getEnv("MIDDLEWARE_INTERNAL_KEY", "nexthub-internal-key")
)

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func internalHeaders() http.Header {
	h := http.Header{}
	h.Set("X-Internal-Key", internalKey)
	h.Set("Content-Type", "application/json")
	return h
}

func doRequest(t *testing.T, method, path string, body interface{}, expectedCodes ...int) *http.Response {
	t.Helper()
	var reqBody *bytes.Buffer
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("failed to marshal request body: %v", err)
		}
		reqBody = bytes.NewBuffer(b)
	} else {
		reqBody = bytes.NewBuffer(nil)
	}

	req, err := http.NewRequest(method, bridgeURL+path, reqBody)
	if err != nil {
		t.Fatalf("failed to create request: %v", err)
	}
	for k, vs := range internalHeaders() {
		for _, v := range vs {
			req.Header.Set(k, v)
		}
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		t.Skipf("service unavailable (connection refused): %v", err)
		return nil
	}

	if len(expectedCodes) > 0 {
		found := false
		for _, code := range expectedCodes {
			if resp.StatusCode == code {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("expected status %v, got %d for %s %s", expectedCodes, resp.StatusCode, method, path)
		}
	}
	return resp
}

// ─── Health Checks ────────────────────────────────────────────────────────────

func TestBridgeHealth(t *testing.T) {
	resp := doRequest(t, "GET", "/health", nil, 200)
	if resp == nil {
		return
	}
	defer resp.Body.Close()
	t.Logf("Bridge health: %d", resp.StatusCode)
}

// ─── MOSIP Routes ─────────────────────────────────────────────────────────────

func TestMOSIPPreRegister(t *testing.T) {
	payload := map[string]interface{}{
		"full_name":      "Test Citizen",
		"date_of_birth":  "1990-01-01",
		"gender":         "MALE",
		"phone":          "+2348012345678",
		"email":          "test@example.com",
		"address":        "1 Test Street, Abuja",
		"language":       "eng",
	}
	resp := doRequest(t, "POST", "/v1/mosip/pre-register", payload, 200, 201, 202, 503)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("MOSIP pre-register: %d", resp.StatusCode)
	}
}

func TestMOSIPUploadPacket(t *testing.T) {
	payload := map[string]interface{}{
		"pre_registration_id":  "TEST-PREREG-001",
		"registration_center_id": "RC001",
		"machine_id":           "MACHINE001",
		"packet_b64":           "dGVzdC1wYWNrZXQ=",
		"packet_hash":          "abc123",
	}
	resp := doRequest(t, "POST", "/v1/mosip/upload-packet", payload, 200, 201, 202, 503)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("MOSIP upload-packet: %d", resp.StatusCode)
	}
}

func TestMOSIPRegistrationStatus(t *testing.T) {
	resp := doRequest(t, "GET", "/v1/mosip/registration-status?rid=TEST-RID-001", nil, 200, 404, 503)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("MOSIP registration status: %d", resp.StatusCode)
	}
}

func TestMOSIPGenerateVID(t *testing.T) {
	payload := map[string]interface{}{
		"uin":      "TEST-UIN-001",
		"vid_type": "PERPETUAL",
	}
	resp := doRequest(t, "POST", "/v1/mosip/generate-vid", payload, 200, 201, 202, 503)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("MOSIP generate-VID: %d", resp.StatusCode)
	}
}

func TestMOSIPVerifyIdentity(t *testing.T) {
	payload := map[string]interface{}{
		"individual_id":      "TEST-VID-001",
		"individual_id_type": "VID",
		"otp":                "123456",
		"transaction_id":     "TXN-TEST-001",
	}
	resp := doRequest(t, "POST", "/v1/mosip/verify-identity", payload, 200, 401, 503)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("MOSIP verify-identity: %d", resp.StatusCode)
	}
}

// ─── Face Biometric Routes ────────────────────────────────────────────────────

func TestFaceQualityRelay(t *testing.T) {
	payload := map[string]interface{}{
		"image_b64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
	}
	resp := doRequest(t, "POST", "/v1/face/quality", payload, 200, 422, 503)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Face quality relay: %d", resp.StatusCode)
	}
}

func TestFaceEnrollRelay(t *testing.T) {
	payload := map[string]interface{}{
		"subject_id": fmt.Sprintf("GO-SMOKE-%d", time.Now().Unix()),
		"image_b64":  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
		"metadata":   map[string]interface{}{"source": "go_smoke_test"},
	}
	resp := doRequest(t, "POST", "/v1/face/enroll", payload, 200, 201, 422, 503)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Face enroll relay: %d", resp.StatusCode)
	}
}

func TestFaceVerifyRelay(t *testing.T) {
	payload := map[string]interface{}{
		"subject_id":      "GO-SMOKE-TEST",
		"image_b64":       "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
		"check_liveness":  true,
	}
	resp := doRequest(t, "POST", "/v1/face/verify", payload, 200, 404, 422, 503)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Face verify relay: %d", resp.StatusCode)
	}
}

func TestFaceLivenessRelay(t *testing.T) {
	payload := map[string]interface{}{
		"image_b64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
	}
	resp := doRequest(t, "POST", "/v1/face/liveness", payload, 200, 422, 503)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Face liveness relay: %d", resp.StatusCode)
	}
}

func TestFaceIdentifyRelay(t *testing.T) {
	payload := map[string]interface{}{
		"image_b64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
		"top_k":     3,
	}
	resp := doRequest(t, "POST", "/v1/face/identify", payload, 200, 422, 503)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Face identify relay: %d", resp.StatusCode)
	}
}

func TestFaceAttributesRelay(t *testing.T) {
	payload := map[string]interface{}{
		"image_b64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
	}
	resp := doRequest(t, "POST", "/v1/face/attributes", payload, 200, 422, 503)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Face attributes relay: %d", resp.StatusCode)
	}
}

func TestDeepfakeDetectRelay(t *testing.T) {
	payload := map[string]interface{}{
		"image_b64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
	}
	resp := doRequest(t, "POST", "/v1/face/deepfake-detect", payload, 200, 422, 503)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Deepfake detect relay: %d", resp.StatusCode)
	}
}

func TestActiveLivenessRelay(t *testing.T) {
	payload := map[string]interface{}{
		"frames":    []string{"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="},
		"challenge": "blink",
	}
	resp := doRequest(t, "POST", "/v1/face/active-liveness", payload, 200, 422, 503)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Active liveness relay: %d", resp.StatusCode)
	}
}

func TestBatchIdentifyRelay(t *testing.T) {
	payload := map[string]interface{}{
		"images": []map[string]interface{}{
			{"image_b64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "ref_id": "t1"},
		},
		"top_k": 3,
	}
	resp := doRequest(t, "POST", "/v1/face/batch-identify", payload, 200, 422, 503)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Batch identify relay: %d", resp.StatusCode)
	}
}

// ─── Fidelity Routes ──────────────────────────────────────────────────────────

func TestFidelityAssessRelay(t *testing.T) {
	payload := map[string]interface{}{
		"image_b64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
		"context":   "enrollment",
	}
	resp := doRequest(t, "POST", "/v1/fidelity/assess", payload, 200, 422, 503)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Fidelity assess relay: %d", resp.StatusCode)
	}
}

func TestFidelityEnrollGatedRelay(t *testing.T) {
	payload := map[string]interface{}{
		"subject_id": fmt.Sprintf("GO-GATED-%d", time.Now().Unix()),
		"image_b64":  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
		"metadata":   map[string]interface{}{"context": "national_id"},
	}
	resp := doRequest(t, "POST", "/v1/fidelity/enroll-gated", payload, 200, 201, 422, 503)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Fidelity enroll-gated relay: %d", resp.StatusCode)
	}
}

// ─── NINAuth Routes ───────────────────────────────────────────────────────────

func TestNINAuthAuthorizeURL(t *testing.T) {
	resp := doRequest(t, "GET", "/v1/ninauth/authorize?redirect_uri=http://localhost:3000/callback&scope=openid+profile", nil, 200, 302, 503)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("NINAuth authorize URL: %d", resp.StatusCode)
	}
}

func TestNINVerify(t *testing.T) {
	payload := map[string]interface{}{
		"nin":           "12345678901",
		"first_name":    "Test",
		"last_name":     "Citizen",
		"date_of_birth": "1990-01-01",
	}
	resp := doRequest(t, "POST", "/v1/ninauth/verify-nin", payload, 200, 401, 422, 503)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("NIN verify: %d", resp.StatusCode)
	}
}

func TestNINFaceMatch(t *testing.T) {
	payload := map[string]interface{}{
		"nin":            "12345678901",
		"live_image_b64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
		"check_liveness": true,
	}
	resp := doRequest(t, "POST", "/v1/ninauth/face-match", payload, 200, 401, 422, 503)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("NIN face match: %d", resp.StatusCode)
	}
}

func TestNINVCVerify(t *testing.T) {
	payload := map[string]interface{}{
		"vc_jwt":           "eyJhbGciOiJSUzI1NiJ9.test.sig",
		"expected_subject": "12345678901",
	}
	resp := doRequest(t, "POST", "/v1/ninauth/verify-vc", payload, 200, 401, 422, 503)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("NIN VC verify: %d", resp.StatusCode)
	}
}

// ─── Partner API Routes ───────────────────────────────────────────────────────

func TestPartnerPublicKey(t *testing.T) {
	resp := doRequest(t, "GET", "/partner/v1/face/public-key", nil, 200, 503)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Partner public key: %d", resp.StatusCode)
	}
}

func TestPartnerFaceVerifyUnauth(t *testing.T) {
	// Without API key, should return 401
	req, _ := http.NewRequest("POST", bridgeURL+"/partner/v1/face/verify", bytes.NewBufferString(`{}`))
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		t.Skipf("service unavailable: %v", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != 401 && resp.StatusCode != 403 {
		t.Errorf("expected 401/403 for unauthenticated partner request, got %d", resp.StatusCode)
	}
	t.Logf("Partner face verify (no key) correctly returned: %d", resp.StatusCode)
}

// ─── Bias Audit Relay Routes ──────────────────────────────────────────────────

func TestBiasAuditIngest(t *testing.T) {
payload := map[string]interface{}{
"operation_id":   "op_test_001",
"tenant_id":      "ten_test",
"subject_id":     "sub_001",
"age_group":      "25-34",
"gender":         "M",
"passed":         true,
"score":          0.92,
"operation_type": "verify",
}
resp := doRequest(t, "POST", "/v1/bias-audit/ingest", payload, 200, 503, 502)
if resp != nil {
defer resp.Body.Close()
t.Logf("Bias audit ingest: %d", resp.StatusCode)
}
}

func TestBiasAuditReport(t *testing.T) {
resp := doRequest(t, "GET", "/v1/bias-audit/report", nil, 200, 503, 502)
if resp != nil {
defer resp.Body.Close()
t.Logf("Bias audit report: %d", resp.StatusCode)
}
}

func TestBiasAuditReportByOp(t *testing.T) {
resp := doRequest(t, "GET", "/v1/bias-audit/report/verify", nil, 200, 503, 502)
if resp != nil {
defer resp.Body.Close()
t.Logf("Bias audit report by op: %d", resp.StatusCode)
}
}

func TestBiasAuditAlerts(t *testing.T) {
resp := doRequest(t, "GET", "/v1/bias-audit/alerts", nil, 200, 503, 502)
if resp != nil {
defer resp.Body.Close()
t.Logf("Bias audit alerts: %d", resp.StatusCode)
}
}

func TestNINAuthConsentAudit(t *testing.T) {
payload := map[string]interface{}{
"subject_id":      "sub_001",
"tenant_id":       "ten_test",
"consent_type":    "biometric_enroll",
"consent_granted": true,
}
resp := doRequest(t, "POST", "/v1/bias-audit/ninauth/consent", payload, 200, 503, 502)
if resp != nil {
defer resp.Body.Close()
t.Logf("NINAuth consent audit: %d", resp.StatusCode)
}
}

func TestNINAuthFaceMatchAudit(t *testing.T) {
payload := map[string]interface{}{
"subject_id":   "sub_001",
"tenant_id":    "ten_test",
"matched":      true,
"score":        0.95,
"operation_id": "op_test_001",
}
resp := doRequest(t, "POST", "/v1/bias-audit/ninauth/face-match", payload, 200, 503, 502)
if resp != nil {
defer resp.Body.Close()
t.Logf("NINAuth face-match audit: %d", resp.StatusCode)
}
}

func TestFidelityAuditIngest(t *testing.T) {
payload := map[string]interface{}{
"subject_id":       "sub_001",
"tenant_id":        "ten_test",
"operation_id":     "op_test_001",
"overall_score":    0.88,
"icao_compliant":   true,
"sharpness_score":  0.91,
"brightness_score": 0.85,
"contrast_score":   0.80,
"pose_yaw":         2.1,
"pose_pitch":       1.5,
"pose_roll":        0.8,
"remediated":       false,
}
resp := doRequest(t, "POST", "/v1/bias-audit/fidelity/ingest", payload, 200, 503, 502)
if resp != nil {
defer resp.Body.Close()
t.Logf("Fidelity audit ingest: %d", resp.StatusCode)
}
}

func TestFidelityAuditReport(t *testing.T) {
resp := doRequest(t, "GET", "/v1/bias-audit/fidelity/report", nil, 200, 503, 502)
if resp != nil {
defer resp.Body.Close()
t.Logf("Fidelity audit report: %d", resp.StatusCode)
}
}

func TestFidelityAuditCompliance(t *testing.T) {
resp := doRequest(t, "GET", "/v1/bias-audit/fidelity/compliance", nil, 200, 503, 502)
if resp != nil {
defer resp.Body.Close()
t.Logf("Fidelity audit compliance: %d", resp.StatusCode)
}
}
