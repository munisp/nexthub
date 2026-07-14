// Package biasaudit provides a Go HTTP client for the NextHub Rust
// face-bias-audit microservice (Axum + sqlx + PostgreSQL).
//
// The bias-audit service exposes the following REST endpoints:
//   GET  /health
//   GET  /metrics
//   POST /v1/bias/ingest
//   GET  /v1/bias/report
//   GET  /v1/bias/report/:op
//   GET  /v1/bias/alert
//   POST /v1/ninauth/consent-audit
//   POST /v1/ninauth/face-match-audit
//   POST /v1/ninauth/vc-audit
//   POST /v1/fidelity/ingest
//   GET  /v1/fidelity/report
//   GET  /v1/fidelity/compliance
package biasaudit

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// ─── Config ───────────────────────────────────────────────────────────────────

// Config holds the bias-audit service connection parameters.
type Config struct {
	BaseURL string
	Timeout time.Duration
}

// ConfigFromEnv loads the bias-audit client config from environment variables.
func ConfigFromEnv() Config {
	timeout, _ := time.ParseDuration(os.Getenv("BIAS_AUDIT_TIMEOUT"))
	if timeout == 0 {
		timeout = 15 * time.Second
	}
	return Config{
		BaseURL: getEnvOrDefault("BIAS_AUDIT_SERVICE_URL", "http://face-bias-audit:8230"),
		Timeout: timeout,
	}
}

func getEnvOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// ─── Client ───────────────────────────────────────────────────────────────────

// Client is the face-bias-audit service HTTP client.
type Client struct {
	cfg  Config
	http *http.Client
}

// New creates a new bias-audit client.
func New(cfg Config) *Client {
	return &Client{
		cfg:  cfg,
		http: &http.Client{Timeout: cfg.Timeout},
	}
}

// ─── Request / Response types ─────────────────────────────────────────────────

// BiasIngestRequest is the payload for POST /v1/bias/ingest.
type BiasIngestRequest struct {
	OperationID   string  `json:"operation_id"`
	TenantID      string  `json:"tenant_id"`
	SubjectID     string  `json:"subject_id"`
	AgeGroup      string  `json:"age_group"`
	Gender        string  `json:"gender"`
	EthnicityHint string  `json:"ethnicity_hint,omitempty"`
	Passed        bool    `json:"passed"`
	Score         float64 `json:"score"`
	OperationType string  `json:"operation_type"` // "verify" | "identify" | "enroll"
}

// BiasIngestResponse is returned by POST /v1/bias/ingest.
type BiasIngestResponse struct {
	Accepted bool   `json:"accepted"`
	EventID  string `json:"event_id"`
}

// GroupMetrics holds per-demographic-group FAR/FRR metrics.
type GroupMetrics struct {
	Group     string  `json:"group"`
	FAR       float64 `json:"far"`
	FRR       float64 `json:"frr"`
	Total     int64   `json:"total"`
	Passed    int64   `json:"passed"`
	Failed    int64   `json:"failed"`
}

// BiasReport is returned by GET /v1/bias/report and GET /v1/bias/report/:op.
type BiasReport struct {
	OperationType string         `json:"operation_type"`
	TenantID      string         `json:"tenant_id"`
	Groups        []GroupMetrics `json:"groups"`
	GeneratedAt   string         `json:"generated_at"`
}

// BiasAlert is returned by GET /v1/bias/alert.
type BiasAlert struct {
	Alerts []struct {
		Group     string  `json:"group"`
		Metric    string  `json:"metric"`
		Value     float64 `json:"value"`
		Threshold float64 `json:"threshold"`
		Severity  string  `json:"severity"`
	} `json:"alerts"`
	AlertCount int    `json:"alert_count"`
	GeneratedAt string `json:"generated_at"`
}

// ConsentAuditRequest is the payload for POST /v1/ninauth/consent-audit.
type ConsentAuditRequest struct {
	SubjectID       string `json:"subject_id"`
	TenantID        string `json:"tenant_id"`
	ConsentType     string `json:"consent_type"`
	ConsentGranted  bool   `json:"consent_granted"`
	NINHash         string `json:"nin_hash,omitempty"`
	IPAddress       string `json:"ip_address,omitempty"`
	UserAgent       string `json:"user_agent,omitempty"`
}

// FaceMatchAuditRequest is the payload for POST /v1/ninauth/face-match-audit.
type FaceMatchAuditRequest struct {
	SubjectID   string  `json:"subject_id"`
	TenantID    string  `json:"tenant_id"`
	NINHash     string  `json:"nin_hash,omitempty"`
	Matched     bool    `json:"matched"`
	Score       float64 `json:"score"`
	OperationID string  `json:"operation_id"`
}

// VCAuditRequest is the payload for POST /v1/ninauth/vc-audit.
type VCAuditRequest struct {
	SubjectID   string `json:"subject_id"`
	TenantID    string `json:"tenant_id"`
	VCJWT       string `json:"vc_jwt"`
	OperationID string `json:"operation_id"`
	Action      string `json:"action"` // "issue" | "verify" | "revoke"
}

// FidelityIngestRequest is the payload for POST /v1/fidelity/ingest.
type FidelityIngestRequest struct {
	SubjectID       string  `json:"subject_id"`
	TenantID        string  `json:"tenant_id"`
	OperationID     string  `json:"operation_id"`
	OverallScore    float64 `json:"overall_score"`
	ICAOCompliant   bool    `json:"icao_compliant"`
	SharpnessScore  float64 `json:"sharpness_score"`
	BrightnessScore float64 `json:"brightness_score"`
	ContrastScore   float64 `json:"contrast_score"`
	PoseYaw         float64 `json:"pose_yaw"`
	PosePitch       float64 `json:"pose_pitch"`
	PoseRoll        float64 `json:"pose_roll"`
	NeuralScore     float64 `json:"neural_score,omitempty"`
	Remediated      bool    `json:"remediated"`
}

// FidelityReport is returned by GET /v1/fidelity/report.
type FidelityReport struct {
	TenantID         string  `json:"tenant_id"`
	TotalAudited     int64   `json:"total_audited"`
	ICAOCompliantPct float64 `json:"icao_compliant_pct"`
	MeanScore        float64 `json:"mean_score"`
	RemediatedPct    float64 `json:"remediated_pct"`
	GeneratedAt      string  `json:"generated_at"`
}

// FidelityCompliance is returned by GET /v1/fidelity/compliance.
type FidelityCompliance struct {
	Compliant   bool    `json:"compliant"`
	Score       float64 `json:"score"`
	Threshold   float64 `json:"threshold"`
	Details     string  `json:"details"`
}

// AuditResponse is a generic acknowledgement response.
type AuditResponse struct {
	Accepted bool   `json:"accepted"`
	EventID  string `json:"event_id,omitempty"`
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

func (c *Client) post(ctx context.Context, path string, body, out any) error {
	b, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("bias_audit marshal: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.cfg.BaseURL+path, bytes.NewReader(b))
	if err != nil {
		return fmt.Errorf("bias_audit request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("bias_audit post %s: %w", path, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("bias_audit post %s: status %d: %s", path, resp.StatusCode, body)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func (c *Client) get(ctx context.Context, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		c.cfg.BaseURL+path, nil)
	if err != nil {
		return fmt.Errorf("bias_audit request: %w", err)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("bias_audit get %s: %w", path, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("bias_audit get %s: status %d: %s", path, resp.StatusCode, body)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// ─── API Methods ──────────────────────────────────────────────────────────────

// IngestBiasEvent sends a single bias audit event to the Rust service.
func (c *Client) IngestBiasEvent(ctx context.Context, req BiasIngestRequest) (*BiasIngestResponse, error) {
	var out BiasIngestResponse
	return &out, c.post(ctx, "/v1/bias/ingest", req, &out)
}

// GetBiasReport retrieves the aggregated FAR/FRR bias report.
func (c *Client) GetBiasReport(ctx context.Context) (*BiasReport, error) {
	var out BiasReport
	return &out, c.get(ctx, "/v1/bias/report", &out)
}

// GetBiasReportByOp retrieves the bias report for a specific operation type.
func (c *Client) GetBiasReportByOp(ctx context.Context, opType string) (*BiasReport, error) {
	var out BiasReport
	return &out, c.get(ctx, "/v1/bias/report/"+opType, &out)
}

// GetBiasAlerts retrieves active bias threshold alerts.
func (c *Client) GetBiasAlerts(ctx context.Context) (*BiasAlert, error) {
	var out BiasAlert
	return &out, c.get(ctx, "/v1/bias/alert", &out)
}

// IngestConsentAudit records a NINAuth consent event.
func (c *Client) IngestConsentAudit(ctx context.Context, req ConsentAuditRequest) (*AuditResponse, error) {
	var out AuditResponse
	return &out, c.post(ctx, "/v1/ninauth/consent-audit", req, &out)
}

// IngestFaceMatchAudit records a NINAuth face+NIN match event.
func (c *Client) IngestFaceMatchAudit(ctx context.Context, req FaceMatchAuditRequest) (*AuditResponse, error) {
	var out AuditResponse
	return &out, c.post(ctx, "/v1/ninauth/face-match-audit", req, &out)
}

// IngestVCAudit records a Verifiable Credential issuance/verification event.
func (c *Client) IngestVCAudit(ctx context.Context, req VCAuditRequest) (*AuditResponse, error) {
	var out AuditResponse
	return &out, c.post(ctx, "/v1/ninauth/vc-audit", req, &out)
}

// IngestFidelityAudit records a photo fidelity audit event.
func (c *Client) IngestFidelityAudit(ctx context.Context, req FidelityIngestRequest) (*AuditResponse, error) {
	var out AuditResponse
	return &out, c.post(ctx, "/v1/fidelity/ingest", req, &out)
}

// GetFidelityReport retrieves the aggregated photo fidelity report.
func (c *Client) GetFidelityReport(ctx context.Context) (*FidelityReport, error) {
	var out FidelityReport
	return &out, c.get(ctx, "/v1/fidelity/report", &out)
}

// GetFidelityCompliance checks whether the fidelity compliance threshold is met.
func (c *Client) GetFidelityCompliance(ctx context.Context) (*FidelityCompliance, error) {
	var out FidelityCompliance
	return &out, c.get(ctx, "/v1/fidelity/compliance", &out)
}
