// face_handlers.go — Go bridge HTTP handlers for the face-biometric sidecar.
//
// Exposes the following routes (registered in main.go under /infra):
//
//   POST /face/verify          — 1:1 face verification (ArcFace cosine similarity)
//   POST /face/liveness        — passive liveness / anti-spoofing check
//   POST /face/quality         — ISO 19794-5 face quality assessment
//   POST /face/enroll          — enroll a face embedding for a subject
//   POST /face/identify        — 1:N identification against enrolled set
//   POST /face/name-match      — Jaro-Winkler name match score
//
// All handlers proxy requests to the Python face-biometric sidecar and
// publish results to Kafka for audit trail.

package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/munisp/nexthub/bridge/internal/facebiometric"
	"github.com/munisp/nexthub/bridge/internal/kafka"
)

// ─── Face Verify ──────────────────────────────────────────────────────────────

// HandleFaceVerify performs 1:1 face verification using ArcFace cosine similarity.
// Optionally runs passive liveness detection and ISO 19794-5 quality assessment.
//
// Request body:
//
//	{
//	  "probe_image_b64":     "<base64-encoded JPEG/PNG>",
//	  "reference_image_b64": "<base64-encoded JPEG/PNG>",
//	  "subject_id":          "optional subject identifier",
//	  "tenant_id":           "optional tenant identifier",
//	  "require_liveness":    true,
//	  "require_quality":     true,
//	  "min_quality_score":   0.50
//	}
func (h *Handler) HandleFaceVerify(c *gin.Context) {
	if h.FaceBiometric == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "face-biometric service not configured"})
		return
	}
	var req facebiometric.FaceVerifyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.MinQualityScore == 0 {
		req.MinQualityScore = 0.50
	}

	result, err := h.FaceBiometric.VerifyFace(c.Request.Context(), req)
	if err != nil {
		h.Log.Error("face.verify.error", zap.Error(err))
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	key := result.ImageHashProbe
	if key == "" {
		key = req.SubjectID
	}
	_ = h.Kafka.Publish(c.Request.Context(), kafka.TopicFaceVerifyResult, key, result)
	h.Log.Info("face.verify.complete",
		zap.String("subject", req.SubjectID),
		zap.Bool("verified", result.Verified),
		zap.Float64("similarity", result.Similarity),
	)
	c.JSON(http.StatusOK, result)
}

// ─── Face Liveness ────────────────────────────────────────────────────────────

// HandleFaceLiveness performs passive liveness / anti-spoofing detection.
// Detects print attacks, replay attacks, and 3D mask attacks.
//
// Request body:
//
//	{
//	  "image_b64":  "<base64-encoded JPEG/PNG>",
//	  "subject_id": "optional",
//	  "tenant_id":  "optional"
//	}
func (h *Handler) HandleFaceLiveness(c *gin.Context) {
	if h.FaceBiometric == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "face-biometric service not configured"})
		return
	}
	var req facebiometric.FaceLivenessRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.FaceBiometric.CheckLiveness(c.Request.Context(), req)
	if err != nil {
		h.Log.Error("face.liveness.error", zap.Error(err))
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	_ = h.Kafka.Publish(c.Request.Context(), kafka.TopicFaceLivenessResult, result.ImageHash, result)
	h.Log.Info("face.liveness.complete",
		zap.String("subject", req.SubjectID),
		zap.Bool("is_live", result.IsLive),
		zap.Float64("liveness_score", result.LivenessScore),
	)
	c.JSON(http.StatusOK, result)
}

// ─── Face Quality ─────────────────────────────────────────────────────────────

// HandleFaceQuality performs ISO 19794-5 inspired face quality assessment.
//
// Request body:
//
//	{
//	  "image_b64":  "<base64-encoded JPEG/PNG>",
//	  "subject_id": "optional",
//	  "tenant_id":  "optional"
//	}
func (h *Handler) HandleFaceQuality(c *gin.Context) {
	if h.FaceBiometric == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "face-biometric service not configured"})
		return
	}
	var req facebiometric.FaceQualityRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.FaceBiometric.AssessQuality(c.Request.Context(), req)
	if err != nil {
		h.Log.Error("face.quality.error", zap.Error(err))
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	h.Log.Info("face.quality.complete",
		zap.String("subject", req.SubjectID),
		zap.Bool("passed", result.QualityPassed),
		zap.Float64("overall_score", result.Metrics.OverallScore),
	)
	c.JSON(http.StatusOK, result)
}

// ─── Face Enroll ──────────────────────────────────────────────────────────────

// HandleFaceEnroll extracts an ArcFace embedding from the provided image and
// stores it in the face-biometric service's Redis cache for future 1:N matching.
//
// Request body:
//
//	{
//	  "image_b64":        "<base64-encoded JPEG/PNG>",
//	  "subject_id":       "<UIN hash or unique subject identifier>",
//	  "tenant_id":        "optional",
//	  "require_liveness": true,
//	  "require_quality":  true
//	}
func (h *Handler) HandleFaceEnroll(c *gin.Context) {
	if h.FaceBiometric == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "face-biometric service not configured"})
		return
	}
	var req facebiometric.FaceEnrollRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.SubjectID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "subject_id is required"})
		return
	}

	result, err := h.FaceBiometric.EnrollFace(c.Request.Context(), req)
	if err != nil {
		h.Log.Error("face.enroll.error", zap.String("subject", req.SubjectID), zap.Error(err))
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	_ = h.Kafka.Publish(c.Request.Context(), kafka.TopicFaceEnrollResult, req.SubjectID, result)
	h.Log.Info("face.enroll.complete",
		zap.String("subject", req.SubjectID),
		zap.Bool("enrolled", result.Enrolled),
		zap.Int("embedding_dim", result.EmbeddingDim),
	)
	c.JSON(http.StatusOK, result)
}

// ─── Face Identify ────────────────────────────────────────────────────────────

// HandleFaceIdentify performs 1:N face identification against a set of enrolled
// subjects. Returns the top-K matches sorted by ArcFace cosine similarity.
//
// Request body:
//
//	{
//	  "probe_image_b64":  "<base64-encoded JPEG/PNG>",
//	  "candidate_ids":    ["subject_id_1", "subject_id_2", ...],
//	  "tenant_id":        "optional",
//	  "require_liveness": true,
//	  "top_k":            5
//	}
func (h *Handler) HandleFaceIdentify(c *gin.Context) {
	if h.FaceBiometric == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "face-biometric service not configured"})
		return
	}
	var req facebiometric.FaceIdentifyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.TopK == 0 {
		req.TopK = 5
	}

	result, err := h.FaceBiometric.IdentifyFace(c.Request.Context(), req)
	if err != nil {
		h.Log.Error("face.identify.error", zap.Error(err))
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	_ = h.Kafka.Publish(c.Request.Context(), kafka.TopicFaceIdentifyResult,
		"identify-"+time.Now().UTC().Format(time.RFC3339), result)
	h.Log.Info("face.identify.complete",
		zap.Bool("identified", result.Identified),
		zap.Float64("top_similarity", result.TopSimilarity),
	)
	c.JSON(http.StatusOK, result)
}

// ─── Name Match ───────────────────────────────────────────────────────────────

// HandleNameMatch computes a Jaro-Winkler name match score between two name
// pairs. Replaces the previous substring heuristic with a proper algorithm.
//
// Request body:
//
//	{
//	  "expected_first": "John",
//	  "expected_last":  "Doe",
//	  "actual_first":   "Jon",
//	  "actual_last":    "Doh",
//	  "expected_full":  "John Doe",   // optional — used instead of first/last
//	  "actual_full":    "Jon Doh"
//	}
func (h *Handler) HandleNameMatch(c *gin.Context) {
	if h.FaceBiometric == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "face-biometric service not configured"})
		return
	}
	var req facebiometric.NameMatchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.FaceBiometric.MatchName(c.Request.Context(), req)
	if err != nil {
		h.Log.Error("face.name_match.error", zap.Error(err))
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

// HandleFaceBatchIdentify handles batch 1:N face identification via Qdrant HNSW.
func (h *Handler) HandleFaceBatchIdentify(c *gin.Context) {
	if h.FaceBiometric == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "face-biometric service not configured"})
		return
	}
	var req facebiometric.FaceBatchIdentifyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result, err := h.FaceBiometric.BatchIdentifyFaces(c.Request.Context(), req)
	if err != nil {
		h.Log.Error("face.batch_identify.error", zap.Error(err))
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	h.Log.Info("face.batch_identify.complete",
		zap.Int("total", result.TotalProbes),
		zap.Int("identified", result.IdentifiedCount),
	)
	c.JSON(http.StatusOK, result)
}

// HandleFacePublicKey returns the RS256 public key for verifying signed assertions.
func (h *Handler) HandleFacePublicKey(c *gin.Context) {
	if h.FaceBiometric == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "face-biometric service not configured"})
		return
	}
	result, err := h.FaceBiometric.GetPublicKey(c.Request.Context())
	if err != nil {
		h.Log.Error("face.public_key.error", zap.Error(err))
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

// ─── SOTA: Active Liveness — Start ───────────────────────────────────────────

func (h *Handler) HandleActiveLivenessStart(c *gin.Context) {
var req facebiometric.ActiveLivenessStartRequest
if err := c.ShouldBindJSON(&req); err != nil {
c.JSON(400, gin.H{"error": err.Error()})
return
}
result, err := h.FaceBiometric.StartActiveLiveness(c.Request.Context(), req)
if err != nil {
c.JSON(502, gin.H{"error": err.Error()})
return
}
c.JSON(200, result)
}

// ─── SOTA: Active Liveness — Verify ──────────────────────────────────────────

func (h *Handler) HandleActiveLivenessVerify(c *gin.Context) {
var req facebiometric.ActiveLivenessVerifyRequest
if err := c.ShouldBindJSON(&req); err != nil {
c.JSON(400, gin.H{"error": err.Error()})
return
}
result, err := h.FaceBiometric.VerifyActiveLiveness(c.Request.Context(), req)
if err != nil {
c.JSON(502, gin.H{"error": err.Error()})
return
}
c.JSON(200, result)
}

// ─── SOTA: Deepfake Detection ─────────────────────────────────────────────────

func (h *Handler) HandleDeepfakeDetect(c *gin.Context) {
var req facebiometric.DeepfakeDetectRequest
if err := c.ShouldBindJSON(&req); err != nil {
c.JSON(400, gin.H{"error": err.Error()})
return
}
result, err := h.FaceBiometric.DetectDeepfake(c.Request.Context(), req)
if err != nil {
c.JSON(502, gin.H{"error": err.Error()})
return
}
c.JSON(200, result)
}

// ─── SOTA: Face Attributes ────────────────────────────────────────────────────

func (h *Handler) HandleFaceAttributes(c *gin.Context) {
var req facebiometric.FaceAttributeRequest
if err := c.ShouldBindJSON(&req); err != nil {
c.JSON(400, gin.H{"error": err.Error()})
return
}
result, err := h.FaceBiometric.GetFaceAttributes(c.Request.Context(), req)
if err != nil {
c.JSON(502, gin.H{"error": err.Error()})
return
}
c.JSON(200, result)
}

// ─── SOTA: Video Verification ─────────────────────────────────────────────────

func (h *Handler) HandleVideoVerify(c *gin.Context) {
var req facebiometric.VideoVerifyRequest
if err := c.ShouldBindJSON(&req); err != nil {
c.JSON(400, gin.H{"error": err.Error()})
return
}
result, err := h.FaceBiometric.VideoVerify(c.Request.Context(), req)
if err != nil {
c.JSON(502, gin.H{"error": err.Error()})
return
}
c.JSON(200, result)
}

// ─── SOTA: Bias Audit ─────────────────────────────────────────────────────────

func (h *Handler) HandleBiasReport(c *gin.Context) {
result, err := h.FaceBiometric.GetBiasReport(c.Request.Context())
if err != nil {
c.JSON(502, gin.H{"error": err.Error()})
return
}
c.JSON(200, result)
}
