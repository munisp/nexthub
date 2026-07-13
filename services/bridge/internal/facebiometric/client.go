// Package facebiometric provides a Go client for the NextHub face-biometric
// Python sidecar service (InsightFace ArcFace + Silent-Face liveness).
package facebiometric

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

// Config holds the face-biometric service connection parameters.
type Config struct {
	BaseURL string
	Timeout time.Duration
}

// ConfigFromEnv loads the face-biometric client config from environment variables.
func ConfigFromEnv() Config {
	timeout, _ := time.ParseDuration(os.Getenv("FACE_BIOMETRIC_TIMEOUT"))
	if timeout == 0 {
		timeout = 30 * time.Second
	}
	return Config{
		BaseURL: getEnvOrDefault("FACE_BIOMETRIC_URL", "http://face-biometric:8220"),
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

// Client is the face-biometric service HTTP client.
type Client struct {
	cfg  Config
	http *http.Client
}

// New creates a new face-biometric client.
func New(cfg Config) *Client {
	return &Client{
		cfg:  cfg,
		http: &http.Client{Timeout: cfg.Timeout},
	}
}

// ─── Request / Response types ─────────────────────────────────────────────────

// FaceVerifyRequest is the request body for 1:1 face verification.
type FaceVerifyRequest struct {
	ProbeImageB64     string  `json:"probe_image_b64"`
	ReferenceImageB64 string  `json:"reference_image_b64"`
	SubjectID         string  `json:"subject_id,omitempty"`
	TenantID          string  `json:"tenant_id,omitempty"`
	RequireLiveness   bool    `json:"require_liveness"`
	RequireQuality    bool    `json:"require_quality"`
	MinQualityScore   float64 `json:"min_quality_score"`
}

// QualityMetrics holds ISO 19794-5 inspired quality metrics.
type QualityMetrics struct {
	BlurScore       float64 `json:"blur_score"`
	BrightnessScore float64 `json:"brightness_score"`
	ContrastScore   float64 `json:"contrast_score"`
	PoseYaw         float64 `json:"pose_yaw"`
	PosePitch       float64 `json:"pose_pitch"`
	PoseRoll        float64 `json:"pose_roll"`
	ResolutionOK    bool    `json:"resolution_ok"`
	FaceSizeRatio   float64 `json:"face_size_ratio"`
	OverallScore    float64 `json:"overall_score"`
}

// FaceVerifyResult is the response from 1:1 face verification.
type FaceVerifyResult struct {
	Verified        bool            `json:"verified"`
	Similarity      float64         `json:"similarity"`
	Distance        float64         `json:"distance"`
	Threshold       float64         `json:"threshold"`
	LivenessPassed  *bool           `json:"liveness_passed"`
	LivenessScore   *float64        `json:"liveness_score"`
	QualityPassed   *bool           `json:"quality_passed"`
	QualityMetrics  *QualityMetrics `json:"quality_metrics"`
	FaceCountProbe  int             `json:"face_count_probe"`
	FaceCountRef    int             `json:"face_count_ref"`
	SubjectID       string          `json:"subject_id"`
	ImageHashProbe  string          `json:"image_hash_probe"`
	VerifiedAt      string          `json:"verified_at"`
	ProcessingMS    float64         `json:"processing_ms"`
	Cached          bool            `json:"cached"`
}

// FaceLivenessRequest is the request body for liveness detection.
type FaceLivenessRequest struct {
	ImageB64  string `json:"image_b64"`
	SubjectID string `json:"subject_id,omitempty"`
	TenantID  string `json:"tenant_id,omitempty"`
}

// FaceLivenessResult is the response from liveness detection.
type FaceLivenessResult struct {
	IsLive        bool    `json:"is_live"`
	SpoofScore    float64 `json:"spoof_score"`
	LivenessScore float64 `json:"liveness_score"`
	AttackType    *string `json:"attack_type"`
	FaceDetected  bool    `json:"face_detected"`
	SubjectID     string  `json:"subject_id"`
	ImageHash     string  `json:"image_hash"`
	CheckedAt     string  `json:"checked_at"`
	ProcessingMS  float64 `json:"processing_ms"`
	Cached        bool    `json:"cached"`
}

// FaceQualityRequest is the request body for quality assessment.
type FaceQualityRequest struct {
	ImageB64  string `json:"image_b64"`
	SubjectID string `json:"subject_id,omitempty"`
	TenantID  string `json:"tenant_id,omitempty"`
}

// FaceQualityResult is the response from quality assessment.
type FaceQualityResult struct {
	QualityPassed bool           `json:"quality_passed"`
	Metrics       QualityMetrics `json:"metrics"`
	FaceDetected  bool           `json:"face_detected"`
	SubjectID     string         `json:"subject_id"`
	ImageHash     string         `json:"image_hash"`
	AssessedAt    string         `json:"assessed_at"`
	ProcessingMS  float64        `json:"processing_ms"`
}

// FaceEnrollRequest is the request body for face enrollment.
type FaceEnrollRequest struct {
	ImageB64        string `json:"image_b64"`
	SubjectID       string `json:"subject_id"`
	TenantID        string `json:"tenant_id,omitempty"`
	RequireLiveness bool   `json:"require_liveness"`
	RequireQuality  bool   `json:"require_quality"`
}

// FaceEnrollResult is the response from face enrollment.
type FaceEnrollResult struct {
	Enrolled       bool    `json:"enrolled"`
	SubjectID      string  `json:"subject_id"`
	EmbeddingDim   int     `json:"embedding_dim"`
	LivenessPassed *bool   `json:"liveness_passed"`
	QualityPassed  *bool   `json:"quality_passed"`
	EnrolledAt     string  `json:"enrolled_at"`
	ProcessingMS   float64 `json:"processing_ms"`
}

// FaceIdentifyRequest is the request body for 1:N identification.
type FaceIdentifyRequest struct {
	ProbeImageB64   string   `json:"probe_image_b64"`
	CandidateIDs    []string `json:"candidate_ids"`
	TenantID        string   `json:"tenant_id,omitempty"`
	RequireLiveness bool     `json:"require_liveness"`
	TopK            int      `json:"top_k"`
}

// FaceIdentifyMatch holds a single match in a 1:N identification result.
type FaceIdentifyMatch struct {
	SubjectID  string  `json:"subject_id"`
	Similarity float64 `json:"similarity"`
	Distance   float64 `json:"distance"`
	Verified   bool    `json:"verified"`
}

// FaceIdentifyResult is the response from 1:N identification.
type FaceIdentifyResult struct {
	Identified     bool                `json:"identified"`
	TopMatchID     *string             `json:"top_match_id"`
	TopSimilarity  float64             `json:"top_similarity"`
	Matches        []FaceIdentifyMatch `json:"matches"`
	ProbeLiveness  *bool               `json:"probe_liveness"`
	ProcessingMS   float64             `json:"processing_ms"`
}

// NameMatchRequest is the request body for name matching.
type NameMatchRequest struct {
	ExpectedFirst *string `json:"expected_first,omitempty"`
	ExpectedLast  *string `json:"expected_last,omitempty"`
	ActualFirst   *string `json:"actual_first,omitempty"`
	ActualLast    *string `json:"actual_last,omitempty"`
	ExpectedFull  *string `json:"expected_full,omitempty"`
	ActualFull    *string `json:"actual_full,omitempty"`
}

// NameMatchResult is the response from name matching.
type NameMatchResult struct {
	MatchScore     float64  `json:"match_score"`
	FirstNameScore *float64 `json:"first_name_score"`
	LastNameScore  *float64 `json:"last_name_score"`
	FullNameScore  *float64 `json:"full_name_score"`
	Matched        bool     `json:"matched"`
}

// ─── API Methods ──────────────────────────────────────────────────────────────

// VerifyFace performs 1:1 face verification.
func (c *Client) VerifyFace(ctx context.Context, req FaceVerifyRequest) (*FaceVerifyResult, error) {
	var result FaceVerifyResult
	if err := c.post(ctx, "/v1/face/verify", req, &result); err != nil {
		return nil, fmt.Errorf("face verify: %w", err)
	}
	return &result, nil
}

// CheckLiveness performs passive liveness / anti-spoofing detection.
func (c *Client) CheckLiveness(ctx context.Context, req FaceLivenessRequest) (*FaceLivenessResult, error) {
	var result FaceLivenessResult
	if err := c.post(ctx, "/v1/face/liveness", req, &result); err != nil {
		return nil, fmt.Errorf("face liveness: %w", err)
	}
	return &result, nil
}

// AssessQuality performs face quality assessment.
func (c *Client) AssessQuality(ctx context.Context, req FaceQualityRequest) (*FaceQualityResult, error) {
	var result FaceQualityResult
	if err := c.post(ctx, "/v1/face/quality", req, &result); err != nil {
		return nil, fmt.Errorf("face quality: %w", err)
	}
	return &result, nil
}

// EnrollFace enrolls a face embedding for a subject.
func (c *Client) EnrollFace(ctx context.Context, req FaceEnrollRequest) (*FaceEnrollResult, error) {
	var result FaceEnrollResult
	if err := c.post(ctx, "/v1/face/enroll", req, &result); err != nil {
		return nil, fmt.Errorf("face enroll: %w", err)
	}
	return &result, nil
}

// IdentifyFace performs 1:N face identification.
func (c *Client) IdentifyFace(ctx context.Context, req FaceIdentifyRequest) (*FaceIdentifyResult, error) {
	var result FaceIdentifyResult
	if err := c.post(ctx, "/v1/face/identify", req, &result); err != nil {
		return nil, fmt.Errorf("face identify: %w", err)
	}
	return &result, nil
}

// MatchName computes a Jaro-Winkler name match score.
func (c *Client) MatchName(ctx context.Context, req NameMatchRequest) (*NameMatchResult, error) {
	var result NameMatchResult
	if err := c.post(ctx, "/v1/name/match", req, &result); err != nil {
		return nil, fmt.Errorf("name match: %w", err)
	}
	return &result, nil
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

func (c *Client) post(ctx context.Context, path string, body, out interface{}) error {
	b, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("marshal request: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.cfg.BaseURL+path, bytes.NewReader(b))
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("http post %s: %w", path, err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read response: %w", err)
	}
	if resp.StatusCode >= 400 {
		return fmt.Errorf("face-biometric service error %d: %s", resp.StatusCode, string(raw))
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return fmt.Errorf("unmarshal response: %w", err)
	}
	return nil
}
