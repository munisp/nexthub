package handlers

// partner_face_handlers.go — Public Partner API face biometric endpoints
//
// These handlers are exposed on the /partner/v1/face/* route group and are
// authenticated via X-API-Key (SHA-256 hashed, stored in face_partner_api_keys).
//
// They proxy to the same face-biometric Python sidecar as the internal routes,
// but add:
//   - Partner identity injection (partner_id, partner_name in request context)
//   - Per-scope enforcement (face:verify, face:liveness, face:enroll, etc.)
//   - Standardised partner response envelope
//   - Audit logging to Kafka with partner_id tag

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/munisp/nexthub/bridge/internal/facebiometric"
	"github.com/munisp/nexthub/bridge/internal/kafka"
	"github.com/munisp/nexthub/bridge/internal/middleware"
)

// partnerEnvelope wraps any face biometric result in a standard partner API
// response envelope.
func partnerEnvelope(c *gin.Context, status int, data any, requestID string) {
	c.JSON(status, gin.H{
		"request_id": requestID,
		"timestamp":  time.Now().UTC().Format(time.RFC3339),
		"data":       data,
	})
}

// partnerRec extracts the authenticated partner record from the Gin context.
func partnerRec(c *gin.Context) (string, string) {
	if rec, ok := c.Get("partner"); ok {
		p := rec.(middleware.PartnerKeyRecord)
		return p.PartnerID, p.PartnerName
	}
	return "unknown", "unknown"
}

// newRequestID returns a new UUID request ID.
func newRequestID() string {
	return uuid.NewString()
}

// ─── GET /partner/v1/face/ping ────────────────────────────────────────────────
// Scope: none (any valid key)
// Connectivity and key validity check for third-party integrators.
func (h *Handler) PartnerPing(c *gin.Context) {
	pid, pname := partnerRec(c)
	c.JSON(http.StatusOK, gin.H{
		"status":       "ok",
		"partner_id":   pid,
		"partner_name": pname,
		"timestamp":    time.Now().UTC().Format(time.RFC3339),
		"service":      "nexthub-face-biometric-partner-api",
		"version":      "v1",
	})
}

// ─── POST /partner/v1/face/verify ────────────────────────────────────────────
// Scope: face:verify
// Compare a probe image against a reference image (1:1 verification).
// Intended for: border control cameras, ATM liveness checks, app selfie-match.
func (h *Handler) PartnerFaceVerify(c *gin.Context) {
	var req facebiometric.FaceVerifyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "code": "INVALID_REQUEST"})
		return
	}
	rid := c.GetHeader("X-Request-ID")
	if rid == "" {
		rid = newRequestID()
	}

	result, err := h.FaceBiometric.VerifyFace(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "code": "UPSTREAM_ERROR"})
		return
	}

	pid, pname := partnerRec(c)
	_ = h.Kafka.Publish(c.Request.Context(), kafka.TopicFaceVerifyResult, rid, map[string]any{
		"request_id":      rid,
		"partner_id":      pid,
		"partner_name":    pname,
		"verified":        result.Verified,
		"similarity":      result.Similarity,
		"liveness_passed": result.LivenessPassed,
		"ts":              time.Now().UTC(),
	})

	partnerEnvelope(c, http.StatusOK, result, rid)
}

// ─── POST /partner/v1/face/liveness ──────────────────────────────────────────
// Scope: face:liveness
// Run passive anti-spoofing on a single image.
// Intended for: camera-gate access control, onboarding selfie liveness.
func (h *Handler) PartnerFaceLiveness(c *gin.Context) {
	var req facebiometric.FaceLivenessRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "code": "INVALID_REQUEST"})
		return
	}
	rid := c.GetHeader("X-Request-ID")
	if rid == "" {
		rid = newRequestID()
	}

	result, err := h.FaceBiometric.CheckLiveness(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "code": "UPSTREAM_ERROR"})
		return
	}

	pid, pname := partnerRec(c)
	_ = h.Kafka.Publish(c.Request.Context(), kafka.TopicFaceLivenessResult, rid, map[string]any{
		"request_id":   rid,
		"partner_id":   pid,
		"partner_name": pname,
		"is_live":      result.IsLive,
		"spoof_score":  result.SpoofScore,
		"attack_type":  result.AttackType,
		"ts":           time.Now().UTC(),
	})

	partnerEnvelope(c, http.StatusOK, result, rid)
}

// ─── POST /partner/v1/face/quality ───────────────────────────────────────────
// Scope: face:quality
// Assess ISO 19794-5 face image quality before enrollment or verification.
// Intended for: camera capture validation, registration station pre-check.
func (h *Handler) PartnerFaceQuality(c *gin.Context) {
	var req facebiometric.FaceQualityRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "code": "INVALID_REQUEST"})
		return
	}
	rid := c.GetHeader("X-Request-ID")
	if rid == "" {
		rid = newRequestID()
	}

	result, err := h.FaceBiometric.AssessQuality(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "code": "UPSTREAM_ERROR"})
		return
	}

	partnerEnvelope(c, http.StatusOK, result, rid)
}

// ─── POST /partner/v1/face/enroll ────────────────────────────────────────────
// Scope: face:enroll
// Enroll a subject's face embedding into the identification set.
// Intended for: registration station operators, HR onboarding systems.
func (h *Handler) PartnerFaceEnroll(c *gin.Context) {
	var req facebiometric.FaceEnrollRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "code": "INVALID_REQUEST"})
		return
	}
	rid := c.GetHeader("X-Request-ID")
	if rid == "" {
		rid = newRequestID()
	}

	result, err := h.FaceBiometric.EnrollFace(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "code": "UPSTREAM_ERROR"})
		return
	}

	pid, pname := partnerRec(c)
	_ = h.Kafka.Publish(c.Request.Context(), kafka.TopicFaceEnrollResult, rid, map[string]any{
		"request_id":   rid,
		"partner_id":   pid,
		"partner_name": pname,
		"subject_id":   req.SubjectID,
		"enrolled":     result.Enrolled,
		"ts":           time.Now().UTC(),
	})

	partnerEnvelope(c, http.StatusOK, result, rid)
}

// ─── POST /partner/v1/face/identify ──────────────────────────────────────────
// Scope: face:identify
// 1:N identification — find the best matching enrolled subject for a probe image.
// Intended for: surveillance cameras, access control gates, border checkpoints.
func (h *Handler) PartnerFaceIdentify(c *gin.Context) {
	var req facebiometric.FaceIdentifyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "code": "INVALID_REQUEST"})
		return
	}
	rid := c.GetHeader("X-Request-ID")
	if rid == "" {
		rid = newRequestID()
	}

	result, err := h.FaceBiometric.IdentifyFace(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "code": "UPSTREAM_ERROR"})
		return
	}

	pid, pname := partnerRec(c)
	_ = h.Kafka.Publish(c.Request.Context(), kafka.TopicFaceIdentifyResult, rid, map[string]any{
		"request_id":   rid,
		"partner_id":   pid,
		"partner_name": pname,
		"identified":   result.Identified,
		"top_match_id": result.TopMatchID,
		"similarity":   result.TopSimilarity,
		"ts":           time.Now().UTC(),
	})

	partnerEnvelope(c, http.StatusOK, result, rid)
}
