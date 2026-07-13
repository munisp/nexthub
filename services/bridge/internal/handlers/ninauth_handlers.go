package handlers

// ninauth_handlers.go — NIMC NINAuth Integration Handlers
//
// Implements three NINAuth integration flows via the face-biometric sidecar:
//   1. OIDC Consent Flow  — /ninauth/init + /ninauth/callback
//   2. Direct NIN Verify  — /ninauth/verify-nin
//   3. Face + NIN Match   — /ninauth/face-match
//   4. VC Verification    — /ninauth/verify-vc
//
// All handlers proxy to the Python face-biometric service which holds the
// NINAuth OIDC client and ArcFace biometric engine.

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/munisp/nexthub/bridge/internal/facebiometric"
	"github.com/munisp/nexthub/bridge/internal/kafka"
	"go.uber.org/zap"
)

// ── Flow 1a: Generate NINAuth OIDC Authorization URL ─────────────────────────

// HandleNINAuthInit generates the NINAuth OIDC authorization URL with PKCE.
func (h *Handler) HandleNINAuthInit(c *gin.Context) {
	var req facebiometric.NINAuthInitRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.State == "" || req.CodeVerifier == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "state and code_verifier are required"})
		return
	}

	result, err := h.FaceBiometric.NINAuthInit(c.Request.Context(), req)
	if err != nil {
		h.Log.Error("ninauth_init_failed", zap.Error(err))
		c.JSON(http.StatusBadGateway, gin.H{"error": "NINAuth init failed", "detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

// ── Flow 1b: Exchange NINAuth Authorization Code for Tokens ──────────────────

// HandleNINAuthCallback exchanges the NINAuth authorization code for tokens.
func (h *Handler) HandleNINAuthCallback(c *gin.Context) {
	var req facebiometric.NINAuthCallbackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Code == "" || req.CodeVerifier == "" || req.State == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "code, code_verifier, and state are required"})
		return
	}

	result, err := h.FaceBiometric.NINAuthCallback(c.Request.Context(), req)
	if err != nil {
		h.Log.Error("ninauth_callback_failed", zap.Error(err))
		c.JSON(http.StatusBadGateway, gin.H{"error": "NINAuth token exchange failed", "detail": err.Error()})
		return
	}

	// Publish consent event to Kafka for audit trail
	_ = h.Kafka.Publish(c.Request.Context(), kafka.TopicNINAuthConsent, req.State, map[string]interface{}{
		"event":     "NINAUTH_CONSENT_GRANTED",
		"nin":       result.NINClaims["sub"],
		"name":      result.NINClaims["name"],
		"timestamp": result.ExpiresIn,
	})

	c.JSON(http.StatusOK, result)
}

// ── Flow 2: Direct NIN Verification (Operator KYC) ───────────────────────────

// HandleNINVerify verifies a NIN against the NIMC database.
func (h *Handler) HandleNINVerify(c *gin.Context) {
	var req facebiometric.NINVerifyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(req.NIN) != 11 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "NIN must be exactly 11 digits"})
		return
	}

	result, err := h.FaceBiometric.NINVerify(c.Request.Context(), req)
	if err != nil {
		h.Log.Error("nin_verify_failed", zap.Error(err), zap.String("nin_prefix", req.NIN[:4]+"*******"))
		c.JSON(http.StatusBadGateway, gin.H{"error": "NIN verification failed", "detail": err.Error()})
		return
	}

	// Publish KYC event to Kafka
	_ = h.Kafka.Publish(c.Request.Context(), kafka.TopicNINAuthKYC, req.NIN, map[string]interface{}{
		"event":      "NIN_KYC_VERIFIED",
		"nin_prefix": req.NIN[:4] + "*******",
		"verified":   result.Verified,
		"match_type": result.MatchType,
	})

	c.JSON(http.StatusOK, result)
}

// ── Flow 3: Face + NIN Biometric Match ───────────────────────────────────────

// HandleNINFaceMatch fetches the NIN photo and runs ArcFace 1:1 + liveness.
func (h *Handler) HandleNINFaceMatch(c *gin.Context) {
	var req facebiometric.NINFaceMatchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.NIN == "" || req.LiveImageB64 == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "nin and live_image_b64 are required"})
		return
	}
	if req.Context == "" {
		req.Context = "government"
	}
	req.CheckLiveness = true

	result, err := h.FaceBiometric.NINFaceMatch(c.Request.Context(), req)
	if err != nil {
		h.Log.Error("nin_face_match_failed", zap.Error(err))
		c.JSON(http.StatusBadGateway, gin.H{"error": "NIN face match failed", "detail": err.Error()})
		return
	}

	// Publish biometric match event to Kafka
	ninPrefix := req.NIN
	if len(ninPrefix) > 4 {
		ninPrefix = ninPrefix[:4] + "*******"
	}
	_ = h.Kafka.Publish(c.Request.Context(), kafka.TopicNINAuthFaceMatch, req.NIN, map[string]interface{}{
		"event":           "NINAUTH_FACE_MATCH",
		"nin_prefix":      ninPrefix,
		"verified":        result.Verified,
		"match_type":      result.MatchType,
		"liveness_passed": result.LivenessPassed,
		"context":         req.Context,
	})

	c.JSON(http.StatusOK, result)
}

// ── Flow 4: W3C Verifiable Credential Verification ───────────────────────────

// HandleNINVCVerify verifies a W3C Verifiable Credential JWT issued by NINAuth.
func (h *Handler) HandleNINVCVerify(c *gin.Context) {
	var req facebiometric.NINVCVerifyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.VCJWT == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "vc_jwt is required"})
		return
	}

	result, err := h.FaceBiometric.NINVCVerify(c.Request.Context(), req)
	if err != nil {
		h.Log.Error("nin_vc_verify_failed", zap.Error(err))
		c.JSON(http.StatusBadGateway, gin.H{"error": "VC verification failed", "detail": err.Error()})
		return
	}

	// Publish VC verification event
	_ = h.Kafka.Publish(c.Request.Context(), kafka.TopicNINAuthVCVerified, req.VCJWT[:16], map[string]interface{}{
		"event":       "NINAUTH_VC_VERIFIED",
		"valid":       result.Valid,
		"issuer":      result.Issuer,
		"subject_nin": result.SubjectNIN,
	})

	c.JSON(http.StatusOK, result)
}

// ── Partner-facing NINAuth endpoints ─────────────────────────────────────────

// PartnerNINFaceMatch is the partner-facing version of HandleNINFaceMatch.
// Requires nin:match scope.
func (h *Handler) PartnerNINFaceMatch(c *gin.Context) {
	h.HandleNINFaceMatch(c)
}

// PartnerNINVerify is the partner-facing NIN verification endpoint.
// Requires nin:verify scope.
func (h *Handler) PartnerNINVerify(c *gin.Context) {
	h.HandleNINVerify(c)
}
