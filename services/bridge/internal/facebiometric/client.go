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

// ─── NINAuth typed methods ────────────────────────────────────────────────────

// NINAuthInitRequest / Result
type NINAuthInitRequest struct {
State        string   `json:"state"`
CodeVerifier string   `json:"code_verifier"`
Nonce        string   `json:"nonce,omitempty"`
Scopes       []string `json:"scopes,omitempty"`
}
type NINAuthInitResult struct {
AuthorizationURL string `json:"authorization_url"`
State            string `json:"state"`
CodeChallenge    string `json:"code_challenge"`
}

// NINAuthCallbackRequest / Result
type NINAuthCallbackRequest struct {
Code         string `json:"code"`
CodeVerifier string `json:"code_verifier"`
State        string `json:"state"`
}
type NINAuthTokenResult struct {
AccessToken   string                 `json:"access_token"`
IDToken       string                 `json:"id_token"`
TokenType     string                 `json:"token_type"`
ExpiresIn     int                    `json:"expires_in"`
NINClaims     map[string]interface{} `json:"nin_claims"`
FacePhotoB64  string                 `json:"face_photo_b64,omitempty"`
}

// NINVerifyRequest / Result
type NINVerifyRequest struct {
NIN         string `json:"nin"`
FirstName   string `json:"first_name"`
LastName    string `json:"last_name"`
DateOfBirth string `json:"date_of_birth,omitempty"`
}
type NINVerifyResult struct {
NIN         string            `json:"nin"`
MatchType   string            `json:"match_type"`
FirstName   string            `json:"first_name"`
LastName    string            `json:"last_name"`
DateOfBirth string            `json:"date_of_birth"`
Gender      string            `json:"gender"`
Verified    bool              `json:"verified"`
FieldResults map[string]string `json:"field_results"`
}

// NINFaceMatchRequest / Result
type NINFaceMatchRequest struct {
NIN           string `json:"nin"`
LiveImageB64  string `json:"live_image_b64"`
AccessToken   string `json:"access_token,omitempty"`
CheckLiveness bool   `json:"check_liveness"`
Context       string `json:"context,omitempty"`
}
type NINFaceMatchResult struct {
NIN            string  `json:"nin"`
Verified       bool    `json:"verified"`
Similarity     float64 `json:"similarity"`
LivenessPassed bool    `json:"liveness_passed"`
LivenessScore  float64 `json:"liveness_score"`
MatchType      string  `json:"match_type"`
NINName        string  `json:"nin_name,omitempty"`
NINDob         string  `json:"nin_dob,omitempty"`
NINGender      string  `json:"nin_gender,omitempty"`
AssertionJWT   string  `json:"assertion_jwt,omitempty"`
Error          string  `json:"error,omitempty"`
}

// NINVCVerifyRequest / Result
type NINVCVerifyRequest struct {
VCJWT string `json:"vc_jwt"`
}
type NINVCVerifyResult struct {
Valid       bool                   `json:"valid"`
Issuer      string                 `json:"issuer,omitempty"`
SubjectNIN  string                 `json:"subject_nin,omitempty"`
Claims      map[string]interface{} `json:"claims"`
Error       string                 `json:"error,omitempty"`
}

// NINAuthInit generates the NINAuth OIDC authorization URL with PKCE.
func (c *Client) NINAuthInit(ctx context.Context, req NINAuthInitRequest) (*NINAuthInitResult, error) {
var out NINAuthInitResult
return &out, c.post(ctx, "/v1/ninauth/init", req, &out)
}

// NINAuthCallback exchanges the authorization code for tokens.
func (c *Client) NINAuthCallback(ctx context.Context, req NINAuthCallbackRequest) (*NINAuthTokenResult, error) {
var out NINAuthTokenResult
return &out, c.post(ctx, "/v1/ninauth/callback", req, &out)
}

// NINVerify verifies a NIN against the NIMC database.
func (c *Client) NINVerify(ctx context.Context, req NINVerifyRequest) (*NINVerifyResult, error) {
var out NINVerifyResult
return &out, c.post(ctx, "/v1/ninauth/verify-nin", req, &out)
}

// NINFaceMatch fetches the NIN photo and runs ArcFace 1:1 + liveness.
func (c *Client) NINFaceMatch(ctx context.Context, req NINFaceMatchRequest) (*NINFaceMatchResult, error) {
var out NINFaceMatchResult
return &out, c.post(ctx, "/v1/ninauth/face-match", req, &out)
}

// NINVCVerify verifies a W3C Verifiable Credential JWT from NINAuth.
func (c *Client) NINVCVerify(ctx context.Context, req NINVCVerifyRequest) (*NINVCVerifyResult, error) {
var out NINVCVerifyResult
return &out, c.post(ctx, "/v1/ninauth/verify-vc", req, &out)
}

// ─── Photo Fidelity Pipeline ──────────────────────────────────────────────────

// ICAOCompliance holds per-criterion ICAO 9303 compliance flags.
type ICAOCompliance struct {
FullyCompliant    bool     `json:"fully_compliant"`
ResolutionOk      bool     `json:"resolution_ok"`
FaceSizeOk        bool     `json:"face_size_ok"`
InterEyeDistance  float64  `json:"inter_eye_distance"`
InterEyeOk        bool     `json:"inter_eye_ok"`
YawOk             bool     `json:"yaw_ok"`
PitchOk           bool     `json:"pitch_ok"`
RollOk            bool     `json:"roll_ok"`
BrightnessOk      bool     `json:"brightness_ok"`
ContrastOk        bool     `json:"contrast_ok"`
SharpnessOk       bool     `json:"sharpness_ok"`
OcclusionOk       bool     `json:"occlusion_ok"`
FailedCriteria    []string `json:"failed_criteria"`
}

// BRISQUEResult holds the BRISQUE no-reference perceptual quality result.
type BRISQUEResult struct {
Score                float64 `json:"score"`
Normalized           float64 `json:"normalized"`
ArtifactsDetected    bool    `json:"artifacts_detected"`
NoiseLevel           float64 `json:"noise_level"`
CompressionArtifacts bool    `json:"compression_artifacts"`
}

// FidelityRequest is the request body for the full fidelity assessment.
type FidelityRequest struct {
ImageB64       string `json:"image_b64"`
AutoRemediate  bool   `json:"auto_remediate"`
ReturnProcessed bool  `json:"return_processed"`
Context        string `json:"context"`
}

// FidelityResponse is the full fidelity report returned by the Python service.
type FidelityResponse struct {
OverallScore        float64         `json:"overall_score"`
EnrollmentReady     bool            `json:"enrollment_ready"`
RemediationApplied  bool            `json:"remediation_applied"`
SharpnessScore      float64         `json:"sharpness_score"`
BrightnessScore     float64         `json:"brightness_score"`
ContrastScore       float64         `json:"contrast_score"`
FaceSizeRatio       float64         `json:"face_size_ratio"`
OcclusionScore      float64         `json:"occlusion_score"`
PoseYaw             float64         `json:"pose_yaw"`
PosePitch           float64         `json:"pose_pitch"`
PoseRoll            float64         `json:"pose_roll"`
ImageWidth          int             `json:"image_width"`
ImageHeight         int             `json:"image_height"`
FaceWidth           int             `json:"face_width"`
FaceHeight          int             `json:"face_height"`
FaceDetected        bool            `json:"face_detected"`
MultipleFaces       bool            `json:"multiple_faces"`
NeuralQualityScore  *float64        `json:"neural_quality_score,omitempty"`
Guidance            []string        `json:"guidance"`
GuidancePriority    string          `json:"guidance_priority"`
ICAO                *ICAOCompliance `json:"icao,omitempty"`
BRISQUE             *BRISQUEResult  `json:"brisque,omitempty"`
ProcessedImageB64   *string         `json:"processed_image_b64,omitempty"`
Error               *string         `json:"error,omitempty"`
ProcessingMs        float64         `json:"processing_ms"`
}

// CaptureGuidanceRequest is the lightweight real-time guidance request.
type CaptureGuidanceRequest struct {
ImageB64 string `json:"image_b64"`
Context  string `json:"context"`
}

// CaptureGuidanceResponse is the lightweight real-time guidance response.
type CaptureGuidanceResponse struct {
OverallScore    float64  `json:"overall_score"`
EnrollmentReady bool     `json:"enrollment_ready"`
GuidancePriority string  `json:"guidance_priority"`
Guidance        []string `json:"guidance"`
PoseYaw         float64  `json:"pose_yaw"`
PosePitch       float64  `json:"pose_pitch"`
PoseRoll        float64  `json:"pose_roll"`
FaceDetected    bool     `json:"face_detected"`
ICAOFailed      []string `json:"icao_failed"`
ProcessingMs    float64  `json:"processing_ms"`
}

// EnrollWithFidelityRequest is the ICAO-gated enrollment request.
type EnrollWithFidelityRequest struct {
SubjectID      string                 `json:"subject_id"`
TenantID       string                 `json:"tenant_id"`
ImageB64       string                 `json:"image_b64"`
AutoRemediate  bool                   `json:"auto_remediate"`
Metadata       map[string]interface{} `json:"metadata,omitempty"`
MinQuality     float64                `json:"min_quality"`
RequireICAO    bool                   `json:"require_icao"`
}

// EnrollWithFidelityResult is the ICAO-gated enrollment result.
type EnrollWithFidelityResult struct {
SubjectID       string                 `json:"subject_id"`
Enrolled        bool                   `json:"enrolled"`
EmbeddingID     *string                `json:"embedding_id,omitempty"`
QualityScore    float64                `json:"quality_score"`
ICAOCompliant   bool                   `json:"icao_compliant"`
FidelityReport  map[string]interface{} `json:"fidelity_report,omitempty"`
RejectionReason *string                `json:"rejection_reason,omitempty"`
}

// AutoCropResult is the response from the auto-crop endpoint.
type AutoCropResult struct {
CroppedImageB64 string `json:"cropped_image_b64"`
Width           int    `json:"width"`
Height          int    `json:"height"`
ICAOMinMet      bool   `json:"icao_min_met"`
}

// ─── Fidelity Client Methods ──────────────────────────────────────────────────

// AssessFidelity runs the full 5-layer ICAO/ISO/NIST fidelity assessment.
func (c *Client) AssessFidelity(ctx context.Context, req FidelityRequest) (*FidelityResponse, error) {
var out FidelityResponse
return &out, c.post(ctx, "/v1/face/fidelity", req, &out)
}

// CaptureGuidance returns low-latency real-time capture guidance.
func (c *Client) CaptureGuidance(ctx context.Context, req CaptureGuidanceRequest) (*CaptureGuidanceResponse, error) {
var out CaptureGuidanceResponse
return &out, c.post(ctx, "/v1/face/capture-guidance", req, &out)
}

// EnrollGated runs ICAO-gated enrollment with auto-remediation.
func (c *Client) EnrollGated(ctx context.Context, req EnrollWithFidelityRequest) (*EnrollWithFidelityResult, error) {
var out EnrollWithFidelityResult
return &out, c.post(ctx, "/v1/face/enroll-gated", req, &out)
}

// AutoCrop crops and enhances the face region to ICAO standards.
func (c *Client) AutoCrop(ctx context.Context, req FidelityRequest) (*AutoCropResult, error) {
var out AutoCropResult
return &out, c.post(ctx, "/v1/face/auto-crop", req, &out)
}
