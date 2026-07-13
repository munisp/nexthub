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

// FaceIdentifyRequest is the request body for 1:N identification via Qdrant HNSW.
type FaceIdentifyRequest struct {
	ProbeImageB64   string  `json:"probe_image_b64"`
	TenantID        string  `json:"tenant_id,omitempty"`
	RequireLiveness bool    `json:"require_liveness"`
	TopK            int     `json:"top_k"`
	ScoreThreshold  float64 `json:"score_threshold,omitempty"`
}

// FaceBatchIdentifyRequest is the request body for batch 1:N identification.
type FaceBatchIdentifyRequest struct {
	Probes   []FaceIdentifyRequest `json:"probes"`
	TenantID string                `json:"tenant_id,omitempty"`
}

// FaceBatchIdentifyResult is the response from batch 1:N identification.
type FaceBatchIdentifyResult struct {
	Results         []FaceIdentifyResult `json:"results"`
	TotalProbes     int                  `json:"total_probes"`
	IdentifiedCount int                  `json:"identified_count"`
	ProcessingMS    float64              `json:"processing_ms"`
}

// FacePublicKeyResult holds the RS256 public key for verifying signed assertions.
type FacePublicKeyResult struct {
	PublicKey string `json:"public_key"`
	Algorithm string `json:"algorithm"`
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

// BatchIdentifyFaces performs batch 1:N face identification.
func (c *Client) BatchIdentifyFaces(ctx context.Context, req FaceBatchIdentifyRequest) (*FaceBatchIdentifyResult, error) {
	var result FaceBatchIdentifyResult
	if err := c.post(ctx, "/v1/face/batch-identify", req, &result); err != nil {
		return nil, fmt.Errorf("face batch identify: %w", err)
	}
	return &result, nil
}

// GetPublicKey retrieves the RS256 public key for verifying signed assertions.
func (c *Client) GetPublicKey(ctx context.Context) (*FacePublicKeyResult, error) {
	var result FacePublicKeyResult
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.cfg.BaseURL+"/v1/face/public-key", nil)
	if err != nil {
		return nil, fmt.Errorf("build public-key request: %w", err)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http get public-key: %w", err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read public-key response: %w", err)
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("face-biometric public-key error %d: %s", resp.StatusCode, string(raw))
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("unmarshal public-key: %w", err)
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

// ─── SOTA: Active Liveness ────────────────────────────────────────────────────

type ActiveLivenessStartRequest struct {
SessionID      string   `json:"session_id,omitempty"`
ChallengeTypes []string `json:"challenge_types,omitempty"`
TenantID       string   `json:"tenant_id,omitempty"`
}

type ActiveLivenessChallenge struct {
SessionID     string `json:"session_id"`
ChallengeType string `json:"challenge_type"`
Instruction   string `json:"instruction"`
ExpiresAt     string `json:"expires_at"`
Nonce         string `json:"nonce"`
}

type ActiveLivenessVerifyRequest struct {
SessionID  string   `json:"session_id"`
FramesB64  []string `json:"frames_b64"`
TenantID   string   `json:"tenant_id,omitempty"`
}

type ActiveLivenessVerifyResult struct {
SessionID     string  `json:"session_id"`
Passed        bool    `json:"passed"`
ChallengeType string  `json:"challenge_type"`
Confidence    float64 `json:"confidence"`
FramesAnalyzed int    `json:"frames_analyzed"`
FailureReason string  `json:"failure_reason,omitempty"`
}

// ─── SOTA: Deepfake Detection ─────────────────────────────────────────────────

type DeepfakeDetectRequest struct {
ImageB64 string `json:"image_b64"`
TenantID string `json:"tenant_id,omitempty"`
Context  string `json:"context,omitempty"`
}

type DeepfakeResult struct {
IsDeepfake       bool    `json:"is_deepfake"`
DeepfakeScore    float64 `json:"deepfake_score"`
AttackType       string  `json:"attack_type,omitempty"`
DctArtifactScore float64 `json:"dct_artifact_score"`
ConsistencyScore float64 `json:"consistency_score"`
Confidence       float64 `json:"confidence"`
}

// ─── SOTA: Face Attributes ────────────────────────────────────────────────────

type FaceAttributeRequest struct {
ImageB64 string   `json:"image_b64"`
TenantID string   `json:"tenant_id,omitempty"`
Actions  []string `json:"actions,omitempty"`
}

type FaceAttributes struct {
AgeEstimate       *float64           `json:"age_estimate,omitempty"`
AgeBracket        string             `json:"age_bracket,omitempty"`
Gender            string             `json:"gender,omitempty"`
GenderConfidence  *float64           `json:"gender_confidence,omitempty"`
Emotion           string             `json:"emotion,omitempty"`
EmotionScores     map[string]float64 `json:"emotion_scores,omitempty"`
PoseYaw           float64            `json:"pose_yaw"`
PosePitch         float64            `json:"pose_pitch"`
PoseRoll          float64            `json:"pose_roll"`
FaceLandmarksCount int               `json:"face_landmarks_count"`
OcclusionRegions  []string           `json:"occlusion_regions,omitempty"`
}

// ─── SOTA: Video Verification ─────────────────────────────────────────────────

type VideoVerifyRequest struct {
FramesB64          []string `json:"frames_b64"`
ReferenceImageB64  string   `json:"reference_image_b64"`
SubjectID          string   `json:"subject_id,omitempty"`
TenantID           string   `json:"tenant_id,omitempty"`
RequireLiveness    bool     `json:"require_liveness"`
Context            string   `json:"context,omitempty"`
}

type VideoVerifyResult struct {
Verified            bool    `json:"verified"`
MeanSimilarity      float64 `json:"mean_similarity"`
MinSimilarity       float64 `json:"min_similarity"`
MaxSimilarity       float64 `json:"max_similarity"`
FramesAnalyzed      int     `json:"frames_analyzed"`
FramesPassed        int     `json:"frames_passed"`
TemporalConsistency float64 `json:"temporal_consistency"`
LivenessPassed      *bool   `json:"liveness_passed,omitempty"`
ProcessingMs        float64 `json:"processing_ms"`
}

// ─── SOTA: Bias Audit ─────────────────────────────────────────────────────────

type BiasReport struct {
GeneratedAt      string        `json:"generated_at"`
WindowSecs       int           `json:"window_secs"`
TotalOperations  int64         `json:"total_operations"`
Groups           []interface{} `json:"groups"`
Alerts           []interface{} `json:"alerts"`
Summary          interface{}   `json:"summary"`
}

// ─── SOTA Client Methods ──────────────────────────────────────────────────────

func (c *Client) StartActiveLiveness(ctx context.Context, req ActiveLivenessStartRequest) (*ActiveLivenessChallenge, error) {
var out ActiveLivenessChallenge
return &out, c.post(ctx, "/v1/face/liveness/active", req, &out)
}

func (c *Client) VerifyActiveLiveness(ctx context.Context, req ActiveLivenessVerifyRequest) (*ActiveLivenessVerifyResult, error) {
var out ActiveLivenessVerifyResult
return &out, c.post(ctx, "/v1/face/liveness/active/verify", req, &out)
}

func (c *Client) DetectDeepfake(ctx context.Context, req DeepfakeDetectRequest) (*DeepfakeResult, error) {
var out DeepfakeResult
return &out, c.post(ctx, "/v1/face/deepfake", req, &out)
}

func (c *Client) GetFaceAttributes(ctx context.Context, req FaceAttributeRequest) (*FaceAttributes, error) {
var out FaceAttributes
return &out, c.post(ctx, "/v1/face/attributes", req, &out)
}

func (c *Client) VideoVerify(ctx context.Context, req VideoVerifyRequest) (*VideoVerifyResult, error) {
var out VideoVerifyResult
return &out, c.post(ctx, "/v1/face/video-verify", req, &out)
}

func (c *Client) GetBiasReport(ctx context.Context) (*BiasReport, error) {
var out BiasReport
return &out, c.get(ctx, "/v1/audit/bias", &out)
}

func (c *Client) get(ctx context.Context, path string, out interface{}) error {
req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.cfg.BaseURL+path, nil)
if err != nil {
return fmt.Errorf("build request: %w", err)
}
resp, err := c.http.Do(req)
if err != nil {
return fmt.Errorf("http get %s: %w", path, err)
}
defer resp.Body.Close()
raw, err := io.ReadAll(resp.Body)
if err != nil {
return fmt.Errorf("read response: %w", err)
}
if resp.StatusCode >= 400 {
return fmt.Errorf("face-biometric service error %d: %s", resp.StatusCode, string(raw))
}
return json.Unmarshal(raw, out)
}
