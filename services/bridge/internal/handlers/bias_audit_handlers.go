package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"github.com/munisp/nexthub/bridge/internal/biasaudit"
)

// ─── Bias Audit Relay Handlers ────────────────────────────────────────────────
// These handlers proxy requests from the Go bridge to the Rust face-bias-audit
// microservice (Axum + sqlx + PostgreSQL, listening on :8230).
// All routes are registered under /v1/bias-audit/ in main.go.

// HandleBiasIngest proxies POST /v1/bias-audit/ingest → Rust POST /v1/bias/ingest.
func (h *Handler) HandleBiasIngest(c *gin.Context) {
	if h.BiasAudit == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "bias_audit_service_unavailable"})
		return
	}
	var req biasaudit.BiasIngestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result, err := h.BiasAudit.IngestBiasEvent(c.Request.Context(), req)
	if err != nil {
		h.Log.Warn("bias_ingest_failed", zap.Error(err))
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

// HandleBiasReport proxies GET /v1/bias-audit/report → Rust GET /v1/bias/report.
func (h *Handler) HandleBiasReport(c *gin.Context) {
	if h.BiasAudit == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "bias_audit_service_unavailable"})
		return
	}
	result, err := h.BiasAudit.GetBiasReport(c.Request.Context())
	if err != nil {
		h.Log.Warn("bias_report_failed", zap.Error(err))
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

// HandleBiasReportByOp proxies GET /v1/bias-audit/report/:op → Rust GET /v1/bias/report/:op.
func (h *Handler) HandleBiasReportByOp(c *gin.Context) {
	if h.BiasAudit == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "bias_audit_service_unavailable"})
		return
	}
	opType := c.Param("op")
	if opType == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "op parameter required"})
		return
	}
	result, err := h.BiasAudit.GetBiasReportByOp(c.Request.Context(), opType)
	if err != nil {
		h.Log.Warn("bias_report_by_op_failed", zap.Error(err))
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

// HandleBiasAlerts proxies GET /v1/bias-audit/alerts → Rust GET /v1/bias/alert.
func (h *Handler) HandleBiasAlerts(c *gin.Context) {
	if h.BiasAudit == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "bias_audit_service_unavailable"})
		return
	}
	result, err := h.BiasAudit.GetBiasAlerts(c.Request.Context())
	if err != nil {
		h.Log.Warn("bias_alerts_failed", zap.Error(err))
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

// HandleNINAuthConsentAudit proxies POST /v1/bias-audit/ninauth/consent
// → Rust POST /v1/ninauth/consent-audit.
func (h *Handler) HandleNINAuthConsentAudit(c *gin.Context) {
	if h.BiasAudit == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "bias_audit_service_unavailable"})
		return
	}
	var req biasaudit.ConsentAuditRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result, err := h.BiasAudit.IngestConsentAudit(c.Request.Context(), req)
	if err != nil {
		h.Log.Warn("consent_audit_failed", zap.Error(err))
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

// HandleNINAuthFaceMatchAudit proxies POST /v1/bias-audit/ninauth/face-match
// → Rust POST /v1/ninauth/face-match-audit.
func (h *Handler) HandleNINAuthFaceMatchAudit(c *gin.Context) {
	if h.BiasAudit == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "bias_audit_service_unavailable"})
		return
	}
	var req biasaudit.FaceMatchAuditRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result, err := h.BiasAudit.IngestFaceMatchAudit(c.Request.Context(), req)
	if err != nil {
		h.Log.Warn("face_match_audit_failed", zap.Error(err))
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

// HandleNINAuthVCAudit proxies POST /v1/bias-audit/ninauth/vc
// → Rust POST /v1/ninauth/vc-audit.
func (h *Handler) HandleNINAuthVCAudit(c *gin.Context) {
	if h.BiasAudit == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "bias_audit_service_unavailable"})
		return
	}
	var req biasaudit.VCAuditRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result, err := h.BiasAudit.IngestVCAudit(c.Request.Context(), req)
	if err != nil {
		h.Log.Warn("vc_audit_failed", zap.Error(err))
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

// HandleFidelityAuditIngest proxies POST /v1/bias-audit/fidelity/ingest
// → Rust POST /v1/fidelity/ingest.
func (h *Handler) HandleFidelityAuditIngest(c *gin.Context) {
	if h.BiasAudit == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "bias_audit_service_unavailable"})
		return
	}
	var req biasaudit.FidelityIngestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result, err := h.BiasAudit.IngestFidelityAudit(c.Request.Context(), req)
	if err != nil {
		h.Log.Warn("fidelity_audit_ingest_failed", zap.Error(err))
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

// HandleFidelityAuditReport proxies GET /v1/bias-audit/fidelity/report
// → Rust GET /v1/fidelity/report.
func (h *Handler) HandleFidelityAuditReport(c *gin.Context) {
	if h.BiasAudit == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "bias_audit_service_unavailable"})
		return
	}
	result, err := h.BiasAudit.GetFidelityReport(c.Request.Context())
	if err != nil {
		h.Log.Warn("fidelity_report_failed", zap.Error(err))
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

// HandleFidelityAuditCompliance proxies GET /v1/bias-audit/fidelity/compliance
// → Rust GET /v1/fidelity/compliance.
func (h *Handler) HandleFidelityAuditCompliance(c *gin.Context) {
	if h.BiasAudit == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "bias_audit_service_unavailable"})
		return
	}
	result, err := h.BiasAudit.GetFidelityCompliance(c.Request.Context())
	if err != nil {
		h.Log.Warn("fidelity_compliance_failed", zap.Error(err))
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}
