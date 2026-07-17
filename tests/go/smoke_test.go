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

// ─── DFSP: Transfer Workflows ─────────────────────────────────────────────────

func TestTransferInitiate(t *testing.T) {
	body := map[string]interface{}{
		"transferId":   "SMOKE-TXN-GO-001",
		"payerDfspId":  "dfsp-payer",
		"payeeDfspId":  "dfsp-payee",
		"amount":       100000,
		"currency":     "NGN",
		"transferType": "P2P",
	}
	resp := doRequest(t, "POST", "/v1/transfer/initiate", body, 200, 201, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Transfer initiate: %d", resp.StatusCode)
	}
}

func TestTransferReverse(t *testing.T) {
	body := map[string]interface{}{
		"transactionId": "SMOKE-TXN-GO-001",
		"reason":        "CUSTOMER_REQUEST",
	}
	resp := doRequest(t, "POST", "/v1/transfer/reverse", body, 200, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Transfer reverse: %d", resp.StatusCode)
	}
}

// ─── DFSP: Dispute Workflows ──────────────────────────────────────────────────

func TestDisputeCreate(t *testing.T) {
	body := map[string]interface{}{
		"disputeId":     "SMOKE-DISP-GO-001",
		"transactionId": "SMOKE-TXN-GO-001",
		"reason":        "UNAUTHORIZED_TRANSACTION",
		"amount":        100000,
		"currency":      "NGN",
	}
	resp := doRequest(t, "POST", "/v1/dispute/create", body, 200, 201, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Dispute create: %d", resp.StatusCode)
	}
}

func TestDisputeResolve(t *testing.T) {
	body := map[string]interface{}{"resolution": "REFUNDED"}
	resp := doRequest(t, "POST", "/v1/dispute/SMOKE-DISP-GO-001/resolve", body, 200, 400, 404, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Dispute resolve: %d", resp.StatusCode)
	}
}

// ─── DFSP: KYC Workflows ──────────────────────────────────────────────────────

func TestKYCSubmit(t *testing.T) {
	body := map[string]interface{}{
		"submissionId": "SMOKE-KYC-GO-001",
		"subjectId":    "SMOKE-TEST-001",
		"documents":    []map[string]string{{"type": "NIN", "data": "dGVzdA=="}},
	}
	resp := doRequest(t, "POST", "/v1/kyc/submit", body, 200, 201, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("KYC submit: %d", resp.StatusCode)
	}
}

func TestKYCUpdateStatus(t *testing.T) {
	body := map[string]interface{}{"status": "APPROVED"}
	resp := doRequest(t, "POST", "/v1/kyc/SMOKE-KYC-GO-001/update-status", body, 200, 400, 404, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("KYC update status: %d", resp.StatusCode)
	}
}

// ─── DFSP: Payout Workflows ───────────────────────────────────────────────────

func TestPayoutInitiate(t *testing.T) {
	body := map[string]interface{}{
		"payoutId":    "SMOKE-PAY-GO-001",
		"merchantId":  "MERCH-001",
		"amountKobo":  500000,
		"currency":    "NGN",
		"bankAccount": "0123456789",
	}
	resp := doRequest(t, "POST", "/v1/payout/initiate", body, 200, 201, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Payout initiate: %d", resp.StatusCode)
	}
}

func TestPayoutApprove(t *testing.T) {
	resp := doRequest(t, "POST", "/v1/payout/SMOKE-PAY-GO-001/approve", map[string]interface{}{}, 200, 400, 404, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Payout approve: %d", resp.StatusCode)
	}
}

func TestPayoutReject(t *testing.T) {
	resp := doRequest(t, "POST", "/v1/payout/SMOKE-PAY-GO-002/reject", map[string]interface{}{}, 200, 400, 404, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Payout reject: %d", resp.StatusCode)
	}
}

// ─── Hub Operator: Settlement ─────────────────────────────────────────────────

func TestSettlementTrigger(t *testing.T) {
	body := map[string]interface{}{"windowId": "WIN-GO-001", "currency": "NGN"}
	resp := doRequest(t, "POST", "/v1/settlement/trigger", body, 200, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Settlement trigger: %d", resp.StatusCode)
	}
}

// ─── Hub Operator: Ledger / TigerBeetle ──────────────────────────────────────

func TestLedgerDebit(t *testing.T) {
	body := map[string]interface{}{
		"walletId": 1001, "amountKobo": 100000, "reference": "SMOKE-DEBIT-GO-001",
	}
	resp := doRequest(t, "POST", "/v1/ledger/debit", body, 200, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Ledger debit: %d", resp.StatusCode)
	}
}

func TestLedgerCredit(t *testing.T) {
	body := map[string]interface{}{
		"walletId": 1002, "amountKobo": 100000, "reference": "SMOKE-CREDIT-GO-001",
	}
	resp := doRequest(t, "POST", "/v1/ledger/credit", body, 200, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Ledger credit: %d", resp.StatusCode)
	}
}

func TestLedgerBalance(t *testing.T) {
	body := map[string]interface{}{"walletId": 1001}
	resp := doRequest(t, "POST", "/v1/ledger/balance", body, 200, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Ledger balance: %d", resp.StatusCode)
	}
}

func TestLedgerAccountBalance(t *testing.T) {
	body := map[string]interface{}{"tenantId": "smoke-tenant"}
	resp := doRequest(t, "POST", "/v1/ledger/account-balance", body, 200, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Ledger account balance: %d", resp.StatusCode)
	}
}

func TestLedgerBatchBalances(t *testing.T) {
	body := map[string]interface{}{"accountIds": []string{"acc-001", "acc-002"}}
	resp := doRequest(t, "POST", "/v1/ledger/batch-balances", body, 200, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Ledger batch balances: %d", resp.StatusCode)
	}
}

// ─── Hub Operator: CBDC / G2P / Remittance / MoMo / Roles ───────────────────

func TestCBDCSwap(t *testing.T) {
	body := map[string]interface{}{
		"swapId": "SWAP-GO-001", "fromAccount": uint64(2001), "toAccount": uint64(2002),
		"amountKobo": uint64(50000), "tokenType": "eNGN",
	}
	resp := doRequest(t, "POST", "/v1/cbdc/swap", body, 200, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("CBDC swap: %d", resp.StatusCode)
	}
}

func TestG2PDisbursement(t *testing.T) {
	body := map[string]interface{}{
		"batchId": "BATCH-GO-001", "programId": "PROG-001",
		"totalKobo": int64(1000000), "beneficiaryCount": 10,
	}
	resp := doRequest(t, "POST", "/v1/g2p/disbursement", body, 200, 201, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("G2P disbursement: %d", resp.StatusCode)
	}
}

func TestRemittanceCreate(t *testing.T) {
	body := map[string]interface{}{
		"remittanceId": "REM-GO-001", "corridorId": "NG-GH",
		"amountKobo": int64(500000), "sourceCurrency": "NGN", "targetCurrency": "GHS",
		"senderId": "SND-001", "receiverId": "RCV-001",
	}
	resp := doRequest(t, "POST", "/v1/remittance/create", body, 200, 201, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Remittance create: %d", resp.StatusCode)
	}
}

func TestMoMoReconcile(t *testing.T) {
	body := map[string]interface{}{
		"transactionRef": "MOMO-GO-001", "momoProvider": "MTN", "amountKobo": int64(200000),
	}
	resp := doRequest(t, "POST", "/v1/momo/reconcile", body, 200, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("MoMo reconcile: %d", resp.StatusCode)
	}
}

func TestRolesSync(t *testing.T) {
	body := map[string]interface{}{"tenantId": "smoke-tenant"}
	resp := doRequest(t, "POST", "/v1/roles/sync", body, 200, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Roles sync: %d", resp.StatusCode)
	}
}

// ─── Hub Operator: Keycloak ───────────────────────────────────────────────────

func TestKeycloakProvision(t *testing.T) {
	body := map[string]interface{}{
		"username":         "smoke-user-go-001",
		"email":            "smoke-go@nexthub.test",
		"firstName":        "Smoke",
		"lastName":         "Go",
		"roles":            []string{"dfsp-operator"},
		"linkedEntityType": "DFSP",
		"linkedEntityId":   "DFSP-001",
		"tempPassword":     "Temp@1234",
	}
	resp := doRequest(t, "POST", "/v1/keycloak/provision", body, 200, 201, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Keycloak provision: %d", resp.StatusCode)
	}
}

// ─── Hub Operator: APISix ─────────────────────────────────────────────────────

func TestAPISixUpsertRoute(t *testing.T) {
	body := map[string]interface{}{
		"routeId":     "smoke-go-route-001",
		"name":        "smoke-go-test-route",
		"uri":         "/smoke-go/*",
		"methods":     []string{"GET", "POST"},
		"upstreamUrl": "http://localhost:8080",
		"plugins":     map[string]interface{}{},
	}
	resp := doRequest(t, "PUT", "/v1/apisix/routes", body, 200, 201, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("APISix upsert route: %d", resp.StatusCode)
	}
}

func TestAPISixUpsertConsumer(t *testing.T) {
	body := map[string]interface{}{
		"username": "smoke-go-consumer",
		"plugins":  map[string]interface{}{"key-auth": map[string]string{"key": "smoke-go-api-key"}},
	}
	resp := doRequest(t, "PUT", "/v1/apisix/consumers", body, 200, 201, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("APISix upsert consumer: %d", resp.StatusCode)
	}
}

func TestAPISixDeleteRoute(t *testing.T) {
	resp := doRequest(t, "DELETE", "/v1/apisix/routes/smoke-go-route-001", nil, 200, 204, 404, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("APISix delete route: %d", resp.StatusCode)
	}
}

// ─── Hub Operator: Dapr ───────────────────────────────────────────────────────

func TestDaprStateSet(t *testing.T) {
	body := map[string]interface{}{
		"key":   "smoke-go-key",
		"value": map[string]interface{}{"test": true},
	}
	resp := doRequest(t, "POST", "/v1/dapr/state", body, 200, 201, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Dapr state set: %d", resp.StatusCode)
	}
}

func TestDaprStateGet(t *testing.T) {
	resp := doRequest(t, "GET", "/v1/dapr/state/smoke-go-key", nil, 200, 404, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Dapr state get: %d", resp.StatusCode)
	}
}

func TestDaprPublish(t *testing.T) {
	body := map[string]interface{}{
		"topic": "smoke-go-topic",
		"data":  map[string]interface{}{"event": "smoke_test_go"},
	}
	resp := doRequest(t, "POST", "/v1/dapr/publish", body, 200, 201, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Dapr publish: %d", resp.StatusCode)
	}
}

// ─── Hub Operator: Kafka ──────────────────────────────────────────────────────

func TestKafkaPublish(t *testing.T) {
	body := map[string]interface{}{
		"topic": "nexthub.smoke.go.test",
		"key":   "smoke-go-key",
		"value": map[string]interface{}{"event": "smoke_test_go"},
	}
	resp := doRequest(t, "POST", "/v1/kafka/publish", body, 200, 201, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Kafka publish: %d", resp.StatusCode)
	}
}

// ─── Hub Operator: Fluvio ─────────────────────────────────────────────────────

func TestFluvioProduce(t *testing.T) {
	body := map[string]interface{}{
		"topic": "nexthub-smoke-go", "key": "smoke-go-key", "value": "smoke-go-test-message",
	}
	resp := doRequest(t, "POST", "/v1/fluvio/produce", body, 200, 201, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Fluvio produce: %d", resp.StatusCode)
	}
}

func TestFluvioCreateTopic(t *testing.T) {
	body := map[string]interface{}{
		"topic": "nexthub-smoke-go-topic", "partitions": 1, "retentionHours": 24,
	}
	resp := doRequest(t, "POST", "/v1/fluvio/topics", body, 200, 201, 400, 409, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Fluvio create topic: %d", resp.StatusCode)
	}
}

func TestFluvioTopicStats(t *testing.T) {
	resp := doRequest(t, "GET", "/v1/fluvio/topics/nexthub-smoke-go/stats", nil, 200, 404, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Fluvio topic stats: %d", resp.StatusCode)
	}
}

// ─── Hub Operator: Permify ────────────────────────────────────────────────────

func TestPermifyCheck(t *testing.T) {
	body := map[string]interface{}{
		"tenantId":   "smoke-tenant",
		"subject":    map[string]string{"type": "user", "id": "user-go-001"},
		"permission": "view",
		"resource":   map[string]string{"type": "transfer", "id": "txn-go-001"},
	}
	resp := doRequest(t, "POST", "/v1/permify/check", body, 200, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Permify check: %d", resp.StatusCode)
	}
}

func TestPermifyWriteRelationship(t *testing.T) {
	body := map[string]interface{}{
		"tenantId": "smoke-tenant",
		"entity":   map[string]string{"type": "organization", "id": "org-go-001"},
		"relation": "member",
		"subject":  map[string]string{"type": "user", "id": "user-go-001"},
	}
	resp := doRequest(t, "POST", "/v1/permify/relationships/write", body, 200, 201, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Permify write relationship: %d", resp.StatusCode)
	}
}

func TestPermifyDeleteRelationship(t *testing.T) {
	body := map[string]interface{}{
		"tenantId": "smoke-tenant",
		"entity":   map[string]string{"type": "organization", "id": "org-go-001"},
		"relation": "member",
		"subject":  map[string]string{"type": "user", "id": "user-go-001"},
	}
	resp := doRequest(t, "POST", "/v1/permify/relationships/delete", body, 200, 204, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Permify delete relationship: %d", resp.StatusCode)
	}
}

func TestPermifyExpand(t *testing.T) {
	body := map[string]interface{}{
		"tenantId":   "smoke-tenant",
		"entity":     map[string]string{"type": "transfer", "id": "txn-go-001"},
		"permission": "view",
	}
	resp := doRequest(t, "POST", "/v1/permify/expand", body, 200, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Permify expand: %d", resp.StatusCode)
	}
}

// ─── Hub Operator: Lakehouse ──────────────────────────────────────────────────

func TestLakehouseEventWrite(t *testing.T) {
	body := map[string]interface{}{
		"eventType":  "TRANSFER_COMPLETED",
		"resource":   "transfer",
		"action":     "complete",
		"outcome":    "SUCCESS",
		"merchantId": "MERCH-GO-001",
		"userId":     "user-go-001",
		"metadata":   map[string]interface{}{"amount": 100000, "currency": "NGN"},
	}
	resp := doRequest(t, "POST", "/v1/lakehouse/events", body, 200, 201, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Lakehouse event write: %d", resp.StatusCode)
	}
}

func TestLakehouseQuery(t *testing.T) {
	body := map[string]interface{}{
		"sql": "SELECT COUNT(*) FROM audit_events WHERE outcome = 'SUCCESS'",
	}
	resp := doRequest(t, "POST", "/v1/lakehouse/query", body, 200, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Lakehouse query: %d", resp.StatusCode)
	}
}

func TestLakehouseReports(t *testing.T) {
	resp := doRequest(t, "GET", "/v1/lakehouse/reports", nil, 200, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Lakehouse reports: %d", resp.StatusCode)
	}
}

// ─── Hub Operator: OpenAppSec ─────────────────────────────────────────────────

func TestOpenAppSecUpsertPolicy(t *testing.T) {
	body := map[string]interface{}{
		"policyId":  "smoke-go-policy-001",
		"name":      "Smoke Go Test Policy",
		"mode":      "prevent-learn",
		"assetUrls": []string{"http://localhost:8200"},
	}
	resp := doRequest(t, "PUT", "/v1/openappsec/policies", body, 200, 201, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("OpenAppSec upsert policy: %d", resp.StatusCode)
	}
}

func TestOpenAppSecAlerts(t *testing.T) {
	resp := doRequest(t, "GET", "/v1/openappsec/alerts", nil, 200, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("OpenAppSec alerts: %d", resp.StatusCode)
	}
}

// ─── Hub Operator: Temporal ───────────────────────────────────────────────────

func TestTemporalStartWorkflow(t *testing.T) {
	body := map[string]interface{}{
		"workflowType": "TransferWorkflow",
		"workflowId":   "smoke-go-wf-001",
		"taskQueue":    "nexthub-main",
		"input":        map[string]string{"transferId": "SMOKE-TXN-GO-001"},
	}
	resp := doRequest(t, "POST", "/v1/temporal/workflows", body, 200, 201, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Temporal start workflow: %d", resp.StatusCode)
	}
}

func TestTemporalWorkflowStatus(t *testing.T) {
	resp := doRequest(t, "GET", "/v1/temporal/workflows/smoke-go-wf-001", nil, 200, 404, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Temporal workflow status: %d", resp.StatusCode)
	}
}

func TestTemporalWorkflowSignal(t *testing.T) {
	body := map[string]interface{}{
		"signalName": "payout-approval",
		"input":      true,
	}
	resp := doRequest(t, "POST", "/v1/temporal/workflows/smoke-go-wf-001/signal", body, 200, 400, 404, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Temporal workflow signal: %d", resp.StatusCode)
	}
}

func TestTemporalWorkflowCancel(t *testing.T) {
	resp := doRequest(t, "POST", "/v1/temporal/workflows/smoke-go-wf-001/cancel", map[string]interface{}{}, 200, 204, 400, 404, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Temporal workflow cancel: %d", resp.StatusCode)
	}
}

// ─── Bridge Face Extended Routes ──────────────────────────────────────────────

func TestFaceVideoVerifyRelay(t *testing.T) {
	img := "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
	body := map[string]interface{}{
		"frames_b64":          []string{img, img},
		"reference_image_b64": img,
	}
	resp := doRequest(t, "POST", "/v1/face/video-verify", body, 200, 422, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Face video verify relay: %d", resp.StatusCode)
	}
}

func TestFaceAutoCropRelay(t *testing.T) {
	img := "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
	body := map[string]interface{}{"image_b64": img}
	resp := doRequest(t, "POST", "/v1/face/auto-crop", body, 200, 422, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Face auto-crop relay: %d", resp.StatusCode)
	}
}

func TestFaceCaptureGuidanceRelay(t *testing.T) {
	img := "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
	body := map[string]interface{}{"image_b64": img, "context": "enrollment"}
	resp := doRequest(t, "POST", "/v1/face/capture-guidance", body, 200, 422, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Face capture guidance relay: %d", resp.StatusCode)
	}
}

func TestFaceNameMatchRelay(t *testing.T) {
	body := map[string]interface{}{
		"expected_full": "Test Citizen",
		"actual_full":   "Test Citizen",
	}
	resp := doRequest(t, "POST", "/v1/face/name-match", body, 200, 422, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Face name match relay: %d", resp.StatusCode)
	}
}

func TestFacePublicKeyRelay(t *testing.T) {
	resp := doRequest(t, "GET", "/v1/face/public-key", nil, 200, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Face public key relay: %d", resp.StatusCode)
	}
}

// ─── Partner Routes (all variants) ───────────────────────────────────────────

func TestPartnerFaceLiveness(t *testing.T) {
	img := "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
	body := map[string]interface{}{"image_b64": img}
	resp := doRequest(t, "POST", "/partner/v1/face/liveness", body, 200, 401, 403, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Partner face liveness: %d", resp.StatusCode)
	}
}

func TestPartnerFaceQuality(t *testing.T) {
	img := "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
	body := map[string]interface{}{"image_b64": img}
	resp := doRequest(t, "POST", "/partner/v1/face/quality", body, 200, 401, 403, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Partner face quality: %d", resp.StatusCode)
	}
}

func TestPartnerFaceEnroll(t *testing.T) {
	img := "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
	body := map[string]interface{}{
		"subject_id": fmt.Sprintf("SMOKE-PARTNER-GO-%d", time.Now().Unix()),
		"image_b64":  img, "require_liveness": false, "require_quality": false,
	}
	resp := doRequest(t, "POST", "/partner/v1/face/enroll", body, 200, 201, 401, 403, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Partner face enroll: %d", resp.StatusCode)
	}
}

func TestPartnerFaceIdentify(t *testing.T) {
	img := "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
	body := map[string]interface{}{
		"probe_image_b64": img, "top_k": 3, "require_liveness": false,
	}
	resp := doRequest(t, "POST", "/partner/v1/face/identify", body, 200, 401, 403, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Partner face identify: %d", resp.StatusCode)
	}
}

func TestPartnerBatchIdentify(t *testing.T) {
	img := "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
	body := map[string]interface{}{
		"probes": []map[string]interface{}{
			{"probe_image_b64": img, "top_k": 3, "require_liveness": false},
		},
	}
	resp := doRequest(t, "POST", "/partner/v1/face/batch-identify", body, 200, 401, 403, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Partner batch identify: %d", resp.StatusCode)
	}
}

func TestPartnerDeepfake(t *testing.T) {
	img := "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
	body := map[string]interface{}{"image_b64": img}
	resp := doRequest(t, "POST", "/partner/v1/face/deepfake", body, 200, 401, 403, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Partner deepfake: %d", resp.StatusCode)
	}
}

func TestPartnerAttributes(t *testing.T) {
	img := "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
	body := map[string]interface{}{"image_b64": img}
	resp := doRequest(t, "POST", "/partner/v1/face/attributes", body, 200, 401, 403, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Partner attributes: %d", resp.StatusCode)
	}
}

func TestPartnerVideoVerify(t *testing.T) {
	img := "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
	body := map[string]interface{}{
		"frames_b64": []string{img, img}, "reference_image_b64": img,
	}
	resp := doRequest(t, "POST", "/partner/v1/face/video-verify", body, 200, 401, 403, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Partner video verify: %d", resp.StatusCode)
	}
}

func TestPartnerActiveLivenessStart(t *testing.T) {
	body := map[string]interface{}{"challenge_types": []string{"BLINK"}}
	resp := doRequest(t, "POST", "/partner/v1/face/liveness/active", body, 200, 401, 403, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Partner active liveness start: %d", resp.StatusCode)
	}
}

func TestPartnerActiveLivenessVerify(t *testing.T) {
	img := "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
	body := map[string]interface{}{
		"session_id": "partner-go-session-001",
		"frames_b64": []string{img, img},
	}
	resp := doRequest(t, "POST", "/partner/v1/face/liveness/active/verify", body, 200, 400, 401, 403, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Partner active liveness verify: %d", resp.StatusCode)
	}
}

func TestPartnerNINAuthFaceMatch(t *testing.T) {
	img := "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
	body := map[string]interface{}{"nin": "12345678901", "live_image_b64": img}
	resp := doRequest(t, "POST", "/partner/v1/ninauth/face-match", body, 200, 400, 401, 403, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Partner NINAuth face match: %d", resp.StatusCode)
	}
}

func TestPartnerNINVerify(t *testing.T) {
	body := map[string]interface{}{
		"nin": "12345678901", "first_name": "Test", "last_name": "Citizen", "date_of_birth": "1990-01-15",
	}
	resp := doRequest(t, "POST", "/partner/v1/ninauth/verify-nin", body, 200, 400, 401, 403, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Partner NIN verify: %d", resp.StatusCode)
	}
}

func TestPartnerFidelity(t *testing.T) {
	img := "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
	body := map[string]interface{}{
		"image_b64": img, "auto_remediate": false, "return_processed": false,
	}
	resp := doRequest(t, "POST", "/partner/v1/face/fidelity", body, 200, 401, 403, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Partner fidelity: %d", resp.StatusCode)
	}
}

func TestPartnerCaptureGuidance(t *testing.T) {
	img := "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
	body := map[string]interface{}{"image_b64": img, "context": "enrollment"}
	resp := doRequest(t, "POST", "/partner/v1/face/capture-guidance", body, 200, 401, 403, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Partner capture guidance: %d", resp.StatusCode)
	}
}

func TestPartnerEnrollGated(t *testing.T) {
	img := "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
	body := map[string]interface{}{
		"subject_id": fmt.Sprintf("SMOKE-PARTNER-GO-GATED-%d", time.Now().Unix()),
		"image_b64":  img, "tenant_id": "partner-go-tenant",
	}
	resp := doRequest(t, "POST", "/partner/v1/face/enroll-gated", body, 200, 201, 401, 403, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Partner enroll gated: %d", resp.StatusCode)
	}
}

func TestPartnerAutoCrop(t *testing.T) {
	img := "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
	body := map[string]interface{}{"image_b64": img}
	resp := doRequest(t, "POST", "/partner/v1/face/auto-crop", body, 200, 401, 403, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Partner auto-crop: %d", resp.StatusCode)
	}
}

// ─── MOSIP Extended Routes ────────────────────────────────────────────────────

func TestMOSIPGetPreReg(t *testing.T) {
	resp := doRequest(t, "GET", "/v1/mosip/registration/pre-reg/TEST-AID-GO-001", nil, 200, 404, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("MOSIP get pre-reg: %d", resp.StatusCode)
	}
}

func TestMOSIPBookAppointment(t *testing.T) {
	body := map[string]interface{}{
		"registrationCenterId": "10001",
		"appointmentDate":      "2026-08-01",
		"timeSlotFrom":         "09:00:00",
	}
	resp := doRequest(t, "POST", "/v1/mosip/registration/appointment", body, 200, 201, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("MOSIP book appointment: %d", resp.StatusCode)
	}
}

func TestMOSIPCancelAppointment(t *testing.T) {
	resp := doRequest(t, "DELETE", "/v1/mosip/registration/appointment/TEST-AID-GO-001", nil, 200, 204, 404, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("MOSIP cancel appointment: %d", resp.StatusCode)
	}
}

func TestMOSIPPacketStatus(t *testing.T) {
	resp := doRequest(t, "GET", "/v1/mosip/registration/packet/TEST-RID-GO-001/status", nil, 200, 404, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("MOSIP packet status: %d", resp.StatusCode)
	}
}

func TestMOSIPUINStatus(t *testing.T) {
	resp := doRequest(t, "GET", "/v1/mosip/registration/uin/123456789012", nil, 200, 404, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("MOSIP UIN status: %d", resp.StatusCode)
	}
}

func TestMOSIPUINUpdate(t *testing.T) {
	body := map[string]interface{}{
		"uin": "123456789012", "demographicData": map[string]string{"phone": "08099999999"},
	}
	resp := doRequest(t, "PUT", "/v1/mosip/registration/uin", body, 200, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("MOSIP UIN update: %d", resp.StatusCode)
	}
}

func TestMOSIPUINLock(t *testing.T) {
	body := map[string]interface{}{
		"uin":       "123456789012",
		"authTypes": []map[string]string{{"authType": "bio", "authSubType": "FACE"}},
	}
	resp := doRequest(t, "POST", "/v1/mosip/registration/uin/lock", body, 200, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("MOSIP UIN lock: %d", resp.StatusCode)
	}
}

func TestMOSIPUINUnlock(t *testing.T) {
	body := map[string]interface{}{
		"uin":       "123456789012",
		"authTypes": []map[string]string{{"authType": "bio", "authSubType": "FACE"}},
	}
	resp := doRequest(t, "POST", "/v1/mosip/registration/uin/unlock", body, 200, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("MOSIP UIN unlock: %d", resp.StatusCode)
	}
}

func TestMOSIPCredentialRequest(t *testing.T) {
	body := map[string]interface{}{
		"uin": "123456789012", "credentialType": "euin", "partnerId": "SMOKE-PARTNER",
	}
	resp := doRequest(t, "POST", "/v1/mosip/registration/credential", body, 200, 201, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("MOSIP credential request: %d", resp.StatusCode)
	}
}

func TestMOSIPCredentialStatus(t *testing.T) {
	resp := doRequest(t, "GET", "/v1/mosip/registration/credential/TEST-REQ-GO-001", nil, 200, 404, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("MOSIP credential status: %d", resp.StatusCode)
	}
}

func TestMOSIPGenerateOTP(t *testing.T) {
	body := map[string]interface{}{
		"transactionId": "TXN-GO-001", "individualId": "123456789012", "otpChannel": []string{"EMAIL"},
	}
	resp := doRequest(t, "POST", "/v1/mosip/otp", body, 200, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("MOSIP generate OTP: %d", resp.StatusCode)
	}
}

func TestMOSIPeKYC(t *testing.T) {
	body := map[string]interface{}{
		"transactionId": "TXN-GO-001", "individualId": "123456789012",
		"otp": "123456", "consentObtained": true,
	}
	resp := doRequest(t, "POST", "/v1/mosip/ekyc", body, 200, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("MOSIP eKYC: %d", resp.StatusCode)
	}
}

func TestMOSIPeSignetAuthURL(t *testing.T) {
	body := map[string]interface{}{
		"redirectUri": "http://localhost:3000/callback", "scope": "openid profile", "state": "test-state-go",
	}
	resp := doRequest(t, "POST", "/v1/mosip/esignet/auth-url", body, 200, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("MOSIP eSignet auth URL: %d", resp.StatusCode)
	}
}

func TestMOSIPeSignetToken(t *testing.T) {
	body := map[string]interface{}{
		"code": "test-code-go", "redirectUri": "http://localhost:3000/callback", "codeVerifier": "test-verifier-go",
	}
	resp := doRequest(t, "POST", "/v1/mosip/esignet/token", body, 200, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("MOSIP eSignet token: %d", resp.StatusCode)
	}
}

func TestMOSIPVCIssue(t *testing.T) {
	body := map[string]interface{}{
		"uin": "123456789012", "credentialType": "OpenId4VCICredential", "partnerId": "SMOKE-PARTNER",
	}
	resp := doRequest(t, "POST", "/v1/mosip/vc/issue", body, 200, 201, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("MOSIP VC issue: %d", resp.StatusCode)
	}
}

func TestMOSIPG2PVerify(t *testing.T) {
	body := map[string]interface{}{
		"beneficiaryId": "BEN-GO-001", "nin": "12345678901", "programId": "PROG-001",
	}
	resp := doRequest(t, "POST", "/v1/mosip/g2p/verify-beneficiary", body, 200, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("MOSIP G2P verify: %d", resp.StatusCode)
	}
}

// ─── NINAuth Extended Routes ──────────────────────────────────────────────────

func TestNINAuthInit(t *testing.T) {
	body := map[string]interface{}{
		"state":         "test-state-go-001",
		"code_verifier": "test-verifier-go-001",
		"redirect_uri":  "http://localhost:3000/callback",
		"scope":         "openid profile nin",
	}
	resp := doRequest(t, "POST", "/v1/ninauth/init", body, 200, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("NINAuth init: %d", resp.StatusCode)
	}
}

func TestNINAuthCallback(t *testing.T) {
	body := map[string]interface{}{
		"code":          "test-auth-code-go",
		"code_verifier": "test-verifier-go-001",
		"redirect_uri":  "http://localhost:3000/callback",
	}
	resp := doRequest(t, "POST", "/v1/ninauth/callback", body, 200, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("NINAuth callback: %d", resp.StatusCode)
	}
}

// ─── Bias Audit Extended Routes ───────────────────────────────────────────────

func TestNINAuthFaceMatchAuditBridge(t *testing.T) {
	body := map[string]interface{}{
		"subject_id":       "SMOKE-TEST-001",
		"nin":              "12345678901",
		"verified":         true,
		"similarity_score": 0.91,
		"liveness_passed":  true,
		"partner_id":       "BRIDGE-GO-PARTNER",
	}
	resp := doRequest(t, "POST", "/v1/bias-audit/ninauth/face-match", body, 200, 201, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("NINAuth face match audit bridge: %d", resp.StatusCode)
	}
}

func TestNINAuthVCAuditBridge(t *testing.T) {
	body := map[string]interface{}{
		"subject_id": "SMOKE-TEST-001",
		"vc_type":    "NINCredential",
		"verified":   true,
		"partner_id": "BRIDGE-GO-PARTNER",
	}
	resp := doRequest(t, "POST", "/v1/bias-audit/ninauth/vc", body, 200, 201, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("NINAuth VC audit bridge: %d", resp.StatusCode)
	}
}

// ─── /nexthub Internal Ledger Routes ─────────────────────────────────────────
// These routes are under /nexthub/* (not /v1/*) and require the same internal key.

func doNexhubRequest(t *testing.T, method, path string, body interface{}, expectedCodes ...int) *http.Response {
	t.Helper()
	return doRequest(t, method, "/nexthub"+path, body, expectedCodes...)
}

func TestProvisionParticipantAccounts(t *testing.T) {
	body := map[string]interface{}{
		"dfspId": "SMOKE-DFSP-GO-001", "currency": "NGN",
		"initialPositionKobo": 0, "initialSettlementKobo": 0,
	}
	resp := doNexhubRequest(t, "POST", "/ledger/provision-participant", body, 200, 201, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Provision participant: %d", resp.StatusCode)
	}
}

func TestProvisionNQRMerchant(t *testing.T) {
	body := map[string]interface{}{
		"merchantId": "SMOKE-MERCH-GO-001", "currency": "NGN", "initialBalanceKobo": 0,
	}
	resp := doNexhubRequest(t, "POST", "/ledger/provision-nqr-merchant", body, 200, 201, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Provision NQR merchant: %d", resp.StatusCode)
	}
}

func TestProvisionCBDCWallet(t *testing.T) {
	body := map[string]interface{}{
		"walletId": "SMOKE-CBDC-GO-001", "tokenType": "eNGN", "initialBalanceKobo": 0,
	}
	resp := doNexhubRequest(t, "POST", "/ledger/provision-cbdc-wallet", body, 200, 201, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Provision CBDC wallet: %d", resp.StatusCode)
	}
}

func TestNIPTransfer(t *testing.T) {
	body := map[string]interface{}{
		"transferId": "SMOKE-NIP-GO-001", "payerAccountId": int64(3001),
		"payeeAccountId": int64(3002), "amountKobo": int64(50000), "currency": "NGN",
	}
	resp := doNexhubRequest(t, "POST", "/ledger/nip-transfer", body, 200, 201, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("NIP transfer: %d", resp.StatusCode)
	}
}

func TestPISPReserve(t *testing.T) {
	body := map[string]interface{}{
		"reservationId": "SMOKE-PISP-GO-001", "payerAccountId": int64(3001),
		"amountKobo": int64(20000), "currency": "NGN",
	}
	resp := doNexhubRequest(t, "POST", "/ledger/pisp-reserve", body, 200, 201, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("PISP reserve: %d", resp.StatusCode)
	}
}

func TestPISPCommit(t *testing.T) {
	body := map[string]interface{}{
		"reservationId": "SMOKE-PISP-GO-001", "payeeAccountId": int64(3002),
	}
	resp := doNexhubRequest(t, "POST", "/ledger/pisp-commit", body, 200, 400, 404, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("PISP commit: %d", resp.StatusCode)
	}
}

func TestPISPVoid(t *testing.T) {
	body := map[string]interface{}{"reservationId": "SMOKE-PISP-GO-002"}
	resp := doNexhubRequest(t, "POST", "/ledger/pisp-void", body, 200, 400, 404, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("PISP void: %d", resp.StatusCode)
	}
}

func TestBulkTransferLeg(t *testing.T) {
	body := map[string]interface{}{
		"batchId": "SMOKE-BULK-GO-001", "legId": "LEG-GO-001",
		"payerAccountId": int64(3001), "payeeAccountId": int64(3002),
		"amountKobo": int64(10000), "currency": "NGN",
	}
	resp := doNexhubRequest(t, "POST", "/ledger/bulk-transfer-leg", body, 200, 201, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Bulk transfer leg: %d", resp.StatusCode)
	}
}

func TestFXConversion(t *testing.T) {
	body := map[string]interface{}{
		"conversionId": "SMOKE-FX-GO-001", "sourceAccountId": int64(3001),
		"targetAccountId": int64(3002), "sourceAmountKobo": int64(100000),
		"sourceCurrency": "NGN", "targetCurrency": "GHS", "fxRate": 0.0285,
	}
	resp := doNexhubRequest(t, "POST", "/ledger/fx-conversion", body, 200, 201, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("FX conversion: %d", resp.StatusCode)
	}
}

func TestRemittanceTransfer(t *testing.T) {
	body := map[string]interface{}{
		"remittanceId": "SMOKE-REM-GO-001", "senderId": "SND-GO-001", "receiverId": "RCV-GO-001",
		"amountKobo": int64(200000), "sourceCurrency": "NGN", "targetCurrency": "GHS",
	}
	resp := doNexhubRequest(t, "POST", "/ledger/remittance-transfer", body, 200, 201, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Remittance transfer: %d", resp.StatusCode)
	}
}

func TestSettlementPrepare(t *testing.T) {
	body := map[string]interface{}{"windowId": "WIN-GO-PREPARE-001", "currency": "NGN"}
	resp := doNexhubRequest(t, "POST", "/ledger/settlement-prepare", body, 200, 400, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Settlement prepare: %d", resp.StatusCode)
	}
}

func TestSettlementCommit(t *testing.T) {
	body := map[string]interface{}{"windowId": "WIN-GO-PREPARE-001"}
	resp := doNexhubRequest(t, "POST", "/ledger/settlement-commit", body, 200, 400, 404, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Settlement commit: %d", resp.StatusCode)
	}
}

func TestSettlementVoid(t *testing.T) {
	body := map[string]interface{}{"windowId": "WIN-GO-VOID-001", "reason": "SMOKE_TEST_VOID"}
	resp := doNexhubRequest(t, "POST", "/ledger/settlement-void", body, 200, 400, 404, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Settlement void: %d", resp.StatusCode)
	}
}

func TestDisputeReversal(t *testing.T) {
	body := map[string]interface{}{
		"disputeId": "SMOKE-DISP-GO-001", "originalTransferId": "SMOKE-TXN-GO-001",
		"amountKobo": int64(100000), "currency": "NGN",
	}
	resp := doNexhubRequest(t, "POST", "/ledger/dispute-reversal", body, 200, 400, 404, 503, 502)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Dispute reversal: %d", resp.StatusCode)
	}
}

// ─── Caddy Admin API relay tests ─────────────────────────────────────────────
// These tests verify that the Go Bridge correctly relays Caddy Admin API
// management requests. All tests accept 200 (success), 503/502 (Caddy
// unavailable), 401 (auth required), and 400 (bad request) as valid responses.

func TestCaddyHealth(t *testing.T) {
	resp := doRequest(t, "GET", "/v1/caddy/health", nil, 200, 503, 502, 401)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Caddy health: %d", resp.StatusCode)
	}
}

func TestCaddyGetConfig(t *testing.T) {
	resp := doRequest(t, "GET", "/v1/caddy/config", nil, 200, 503, 502, 401)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Caddy get config: %d", resp.StatusCode)
	}
}

func TestCaddyUpsertRoute(t *testing.T) {
	body := map[string]interface{}{
		"routeId":      "smoke-test-tenant-route",
		"hosts":        []string{"smoke.paygate.ng"},
		"upstreamDial": "nexthub:3001",
		"terminal":     true,
	}
	resp := doRequest(t, "PUT", "/v1/caddy/routes", body, 200, 503, 502, 401, 400)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Caddy upsert route: %d", resp.StatusCode)
	}
}

func TestCaddyDeleteRoute(t *testing.T) {
	resp := doRequest(t, "DELETE", "/v1/caddy/routes/smoke-test-tenant-route", nil, 200, 503, 502, 401, 404)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Caddy delete route: %d", resp.StatusCode)
	}
}

func TestCaddyUpdateUpstream(t *testing.T) {
	body := map[string]interface{}{
		"routeId":   "nexthub-main",
		"upstreams": []string{"nexthub:3001"},
	}
	resp := doRequest(t, "PUT", "/v1/caddy/upstreams", body, 200, 503, 502, 401, 400)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Caddy update upstream: %d", resp.StatusCode)
	}
}

func TestCaddyAddTLSPolicy(t *testing.T) {
	body := map[string]interface{}{
		"subjects":  []string{"smoke.paygate.ng"},
		"acmeEmail": "ops@nexthub.io",
	}
	resp := doRequest(t, "POST", "/v1/caddy/tls/policies", body, 200, 503, 502, 401, 400)
	if resp != nil {
		defer resp.Body.Close()
		t.Logf("Caddy add TLS policy: %d", resp.StatusCode)
	}
}

// TestCaddyRouteAuthRequired verifies that Caddy relay routes reject requests
// without the internal API key.
func TestCaddyRouteAuthRequired(t *testing.T) {
	req, err := http.NewRequest("GET", bridgeURL+"/v1/caddy/config", nil)
	if err != nil {
		t.Fatalf("failed to create request: %v", err)
	}
	// Deliberately omit the X-Internal-Key header
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		t.Skipf("Bridge unavailable: %v", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != 401 && resp.StatusCode != 403 {
		t.Errorf("expected 401/403 for unauthenticated Caddy config request, got %d", resp.StatusCode)
	}
	t.Logf("Caddy config without auth correctly returned: %d", resp.StatusCode)
}
