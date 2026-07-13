package handlers

import (
"net/http"
"time"

"github.com/gin-gonic/gin"
"github.com/munisp/nexthub/bridge/internal/facebiometric"
"github.com/munisp/nexthub/bridge/internal/kafka"
)

// HandleFidelityAssess proxies the full 5-layer ICAO/ISO/NIST fidelity assessment.
func (h *Handler) HandleFidelityAssess(c *gin.Context) {
var req facebiometric.FidelityRequest
if err := c.ShouldBindJSON(&req); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request"})
return
}
if req.Context == "" {
req.Context = "enrollment"
}
req.AutoRemediate = true

result, err := h.FaceBiometric.AssessFidelity(c.Request.Context(), req)
if err != nil {
c.JSON(http.StatusServiceUnavailable, gin.H{"error": "fidelity_service_unavailable"})
return
}

go h.Kafka.Publish(c.Request.Context(), kafka.TopicFaceFidelityAudit, result.GuidancePriority, map[string]interface{}{
"overall_score":    result.OverallScore,
"enrollment_ready": result.EnrollmentReady,
"icao_compliant":   result.ICAO != nil && result.ICAO.FullyCompliant,
"guidance":         result.Guidance,
"processing_ms":    result.ProcessingMs,
"ts":               time.Now().UTC().Format(time.RFC3339),
})

c.JSON(http.StatusOK, result)
}

// HandleCaptureGuidance provides low-latency real-time capture guidance for live cameras.
func (h *Handler) HandleCaptureGuidance(c *gin.Context) {
var req facebiometric.CaptureGuidanceRequest
if err := c.ShouldBindJSON(&req); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request"})
return
}
if req.Context == "" {
req.Context = "enrollment"
}

result, err := h.FaceBiometric.CaptureGuidance(c.Request.Context(), req)
if err != nil {
c.JSON(http.StatusServiceUnavailable, gin.H{"error": "guidance_service_unavailable"})
return
}

c.JSON(http.StatusOK, result)
}

// HandleEnrollGated performs ICAO-gated enrollment with auto-remediation.
func (h *Handler) HandleEnrollGated(c *gin.Context) {
var req facebiometric.EnrollWithFidelityRequest
if err := c.ShouldBindJSON(&req); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request"})
return
}
if req.MinQuality == 0 {
req.MinQuality = 0.70
}
req.RequireICAO = true
req.AutoRemediate = true

result, err := h.FaceBiometric.EnrollGated(c.Request.Context(), req)
if err != nil {
c.JSON(http.StatusServiceUnavailable, gin.H{"error": "enroll_service_unavailable"})
return
}

status := "enrolled"
if !result.Enrolled {
status = "rejected"
}
go h.Kafka.Publish(c.Request.Context(), kafka.TopicFaceEnrollGated, result.SubjectID, map[string]interface{}{
"subject_id":       result.SubjectID,
"status":           status,
"quality_score":    result.QualityScore,
"icao_compliant":   result.ICAOCompliant,
"rejection_reason": result.RejectionReason,
"ts":               time.Now().UTC().Format(time.RFC3339),
})

statusCode := http.StatusOK
if !result.Enrolled {
statusCode = http.StatusUnprocessableEntity
}
c.JSON(statusCode, result)
}

// HandleAutoCrop crops and enhances the face region to ICAO-compliant dimensions.
func (h *Handler) HandleAutoCrop(c *gin.Context) {
var req facebiometric.FidelityRequest
if err := c.ShouldBindJSON(&req); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request"})
return
}
req.AutoRemediate = true

result, err := h.FaceBiometric.AutoCrop(c.Request.Context(), req)
if err != nil {
c.JSON(http.StatusServiceUnavailable, gin.H{"error": "autocrop_service_unavailable"})
return
}

c.JSON(http.StatusOK, result)
}
