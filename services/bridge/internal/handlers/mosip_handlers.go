// mosip_handlers.go — MOSIP IDA eKYC and eSignet OIDC4VP/OIDC4VCI HTTP handlers
// for the NextHub Go bridge service.
package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/munisp/nexthub/bridge/internal/kafka"
	"github.com/munisp/nexthub/bridge/internal/mosip"
)

// ─── eKYC ─────────────────────────────────────────────────────────────────────

// MOSIPEKYCRequest is the request body for the eKYC endpoint.
type MOSIPEKYCRequest struct {
	IndividualID        string   `json:"individualId" binding:"required"`
	IndividualIDType    string   `json:"individualIdType" binding:"required"` // "UIN" | "VID"
	OTP                 string   `json:"otp"`
	BiometricData       string   `json:"biometricData"`
	ConsentObtained     bool     `json:"consentObtained"`
	RequestedAttributes []string `json:"requestedAttributes"`
	TransactionID       string   `json:"transactionId" binding:"required"`
	TenantID            string   `json:"tenantId"`
	PartnerID           string   `json:"partnerId"`
}

// SubmitEKYC handles POST /v1/mosip/ekyc
// Sends an eKYC request to the MOSIP IDA API and returns the KYC attributes.
func (h *Handler) SubmitEKYC(c *gin.Context) {
	var req MOSIPEKYCRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if h.MOSIP == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MOSIP client not configured"})
		return
	}

	ekycReq := mosip.EKYCRequest{
		IndividualID:        req.IndividualID,
		IndividualIDType:    req.IndividualIDType,
		OTP:                 req.OTP,
		BiometricData:       req.BiometricData,
		ConsentObtained:     req.ConsentObtained,
		RequestedAttributes: req.RequestedAttributes,
		TransactionID:       req.TransactionID,
	}

	resp, err := h.MOSIP.SendEKYC(c.Request.Context(), ekycReq)
	if err != nil {
		h.Log.Error("mosip.ekyc.failed",
			zap.String("transactionId", req.TransactionID),
			zap.Error(err),
		)
		// Publish failure event to Kafka
		_ = h.Kafka.Publish(c.Request.Context(), kafka.TopicMOSIPEKYCResult,
			req.TransactionID, map[string]interface{}{
				"transactionId": req.TransactionID,
				"tenantId":      req.TenantID,
				"status":        "FAILED",
				"error":         err.Error(),
				"timestamp":     time.Now().UTC().Format(time.RFC3339),
			})
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "transactionId": req.TransactionID})
		return
	}

	// Publish success event to Kafka
	_ = h.Kafka.Publish(c.Request.Context(), kafka.TopicMOSIPEKYCResult,
		req.TransactionID, map[string]interface{}{
			"transactionId": req.TransactionID,
			"tenantId":      req.TenantID,
			"status":        "SUCCESS",
			"responseTime":  resp.ResponseTime,
			"timestamp":     time.Now().UTC().Format(time.RFC3339),
		})

	h.Log.Info("mosip.ekyc.success",
		zap.String("transactionId", req.TransactionID),
		zap.String("tenantId", req.TenantID),
	)

	c.JSON(http.StatusOK, gin.H{
		"transactionId": resp.TransactionID,
		"responseTime":  resp.ResponseTime,
		"kycData":       resp.Response,
		"status":        "SUCCESS",
	})
}

// ─── OTP Generation ───────────────────────────────────────────────────────────

// MOSIPOTPRequest is the request body for the OTP generation endpoint.
type MOSIPOTPRequest struct {
	IndividualID     string   `json:"individualId" binding:"required"`
	IndividualIDType string   `json:"individualIdType" binding:"required"`
	OTPChannel       []string `json:"otpChannel" binding:"required"` // ["EMAIL", "PHONE"]
	TransactionID    string   `json:"transactionId" binding:"required"`
	TenantID         string   `json:"tenantId"`
}

// GenerateOTP handles POST /v1/mosip/otp
// Requests MOSIP to send an OTP to the individual's registered email/phone.
func (h *Handler) GenerateOTP(c *gin.Context) {
	var req MOSIPOTPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if h.MOSIP == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MOSIP client not configured"})
		return
	}

	otpResp, err := h.MOSIP.GenerateOTP(c.Request.Context(), mosip.OTPRequest{
		IndividualID:     req.IndividualID,
		IndividualIDType: req.IndividualIDType,
		OTPChannel:       req.OTPChannel,
		TransactionID:    req.TransactionID,
	})
	if err != nil {
		h.Log.Error("mosip.otp.failed",
			zap.String("transactionId", req.TransactionID),
			zap.Error(err),
		)
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "transactionId": req.TransactionID})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"transactionId": otpResp.TransactionID,
		"maskedEmail":   otpResp.Response.MaskedEmail,
		"maskedMobile":  otpResp.Response.MaskedMobile,
		"status":        "OTP_SENT",
	})
}

// ─── eSignet Authorization URL ────────────────────────────────────────────────

// ESignetAuthURLRequest is the request body for the eSignet authorization URL endpoint.
type ESignetAuthURLRequest struct {
	ClientID    string `json:"clientId" binding:"required"`
	RedirectURI string `json:"redirectUri" binding:"required"`
	Scope       string `json:"scope"`
	ACRValues   string `json:"acrValues"`
	State       string `json:"state" binding:"required"`
	Nonce       string `json:"nonce" binding:"required"`
	Claims      string `json:"claims"`
}

// GetESignetAuthURL handles POST /v1/mosip/esignet/auth-url
// Returns the eSignet OIDC4VP authorization URL for the client to redirect to.
func (h *Handler) GetESignetAuthURL(c *gin.Context) {
	var req ESignetAuthURLRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if h.MOSIP == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MOSIP client not configured"})
		return
	}

	scope := req.Scope
	if scope == "" {
		scope = "openid profile email phone"
	}
	acrValues := req.ACRValues
	if acrValues == "" {
		acrValues = "mosip:idp:acr:generated-code"
	}

	authURL := h.MOSIP.AuthorizationURL(mosip.AuthorizationRequest{
		ClientID:    req.ClientID,
		RedirectURI: req.RedirectURI,
		Scope:       scope,
		ACRValues:   acrValues,
		State:       req.State,
		Nonce:       req.Nonce,
		Claims:      req.Claims,
	})

	c.JSON(http.StatusOK, gin.H{
		"authorizationUrl": authURL,
		"state":            req.State,
		"nonce":            req.Nonce,
	})
}

// ─── eSignet Token Exchange ───────────────────────────────────────────────────

// ESignetTokenRequest is the request body for the eSignet token exchange endpoint.
type ESignetTokenRequest struct {
	Code         string `json:"code" binding:"required"`
	RedirectURI  string `json:"redirectUri" binding:"required"`
	ClientID     string `json:"clientId" binding:"required"`
	ClientSecret string `json:"clientSecret" binding:"required"`
	TenantID     string `json:"tenantId"`
}

// ExchangeESignetCode handles POST /v1/mosip/esignet/token
// Exchanges an authorization code for tokens at eSignet.
func (h *Handler) ExchangeESignetCode(c *gin.Context) {
	var req ESignetTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if h.MOSIP == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MOSIP client not configured"})
		return
	}

	tokenResp, err := h.MOSIP.ExchangeCode(c.Request.Context(), mosip.TokenRequest{
		Code:         req.Code,
		RedirectURI:  req.RedirectURI,
		ClientID:     req.ClientID,
		ClientSecret: req.ClientSecret,
	})
	if err != nil {
		h.Log.Error("esignet.token.failed", zap.Error(err))
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	// Publish eSignet login event
	_ = h.Kafka.Publish(c.Request.Context(), kafka.TopicMOSIPESignetLogin,
		req.ClientID, map[string]interface{}{
			"clientId":  req.ClientID,
			"tenantId":  req.TenantID,
			"status":    "TOKEN_ISSUED",
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})

	c.JSON(http.StatusOK, gin.H{
		"accessToken":  tokenResp.AccessToken,
		"tokenType":    tokenResp.TokenType,
		"expiresIn":    tokenResp.ExpiresIn,
		"idToken":      tokenResp.IDToken,
	})
}

// ─── OIDC4VCI — Verifiable Credential Issuance ────────────────────────────────

// VCIssuanceRequest is the request body for the VC issuance endpoint.
type VCIssuanceRequest struct {
	AccessToken  string                 `json:"accessToken" binding:"required"`
	Format       string                 `json:"format"`
	CredentialDef map[string]interface{} `json:"credentialDefinition"`
	ProofJWT     string                 `json:"proofJwt" binding:"required"`
	TenantID     string                 `json:"tenantId"`
	IndividualID string                 `json:"individualId"`
}

// IssueVerifiableCredential handles POST /v1/mosip/vc/issue
// Issues a Verifiable Credential via eSignet's OIDC4VCI endpoint.
func (h *Handler) IssueVerifiableCredential(c *gin.Context) {
	var req VCIssuanceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if h.MOSIP == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MOSIP client not configured"})
		return
	}

	format := req.Format
	if format == "" {
		format = "ldp_vc"
	}
	credDef := req.CredentialDef
	if credDef == nil {
		credDef = map[string]interface{}{
			"@context": []string{"https://www.w3.org/2018/credentials/v1"},
			"type":     []string{"VerifiableCredential", "MOSIPVerifiableCredential"},
		}
	}

	vcResp, err := h.MOSIP.IssueCredential(c.Request.Context(), req.AccessToken, mosip.CredentialRequest{
		Format:               format,
		CredentialDefinition: credDef,
		Proof: mosip.CredentialProof{
			ProofType: "jwt",
			JWT:       req.ProofJWT,
		},
	})
	if err != nil {
		h.Log.Error("esignet.vc.issue.failed",
			zap.String("tenantId", req.TenantID),
			zap.Error(err),
		)
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	// Publish VC issuance event
	_ = h.Kafka.Publish(c.Request.Context(), kafka.TopicMOSIPVCIssued,
		req.IndividualID, map[string]interface{}{
			"individualId": req.IndividualID,
			"tenantId":     req.TenantID,
			"format":       vcResp.Format,
			"status":       "ISSUED",
			"timestamp":    time.Now().UTC().Format(time.RFC3339),
		})

	h.Log.Info("esignet.vc.issued",
		zap.String("format", vcResp.Format),
		zap.String("tenantId", req.TenantID),
	)

	c.JSON(http.StatusOK, gin.H{
		"format":     vcResp.Format,
		"credential": vcResp.Credential,
		"cNonce":     vcResp.CNonce,
		"status":     "ISSUED",
	})
}

// ─── G2P Beneficiary Identity Verification ────────────────────────────────────

// G2PBeneficiaryVerifyRequest is the request body for G2P beneficiary identity verification.
type G2PBeneficiaryVerifyRequest struct {
	BeneficiaryID    string `json:"beneficiaryId" binding:"required"`
	IndividualID     string `json:"individualId" binding:"required"`
	IndividualIDType string `json:"individualIdType" binding:"required"` // "UIN" | "VID" | "NIN" | "BVN"
	OTP              string `json:"otp"`
	TransactionID    string `json:"transactionId" binding:"required"`
	ProgramID        string `json:"programId"`
	TenantID         string `json:"tenantId"`
}

// VerifyG2PBeneficiary handles POST /v1/mosip/g2p/verify-beneficiary
// Verifies a G2P program beneficiary's identity via MOSIP IDA before disbursement.
func (h *Handler) VerifyG2PBeneficiary(c *gin.Context) {
	var req G2PBeneficiaryVerifyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if h.MOSIP == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MOSIP client not configured"})
		return
	}

	// For G2P, we request name, dateOfBirth, and gender attributes
	ekycResp, err := h.MOSIP.SendEKYC(c.Request.Context(), mosip.EKYCRequest{
		IndividualID:        req.IndividualID,
		IndividualIDType:    req.IndividualIDType,
		OTP:                 req.OTP,
		ConsentObtained:     true,
		RequestedAttributes: []string{"name", "dateOfBirth", "gender", "phone", "email"},
		TransactionID:       req.TransactionID,
	})
	if err != nil {
		h.Log.Error("mosip.g2p.verify.failed",
			zap.String("beneficiaryId", req.BeneficiaryID),
			zap.Error(err),
		)
		_ = h.Kafka.Publish(c.Request.Context(), kafka.TopicMOSIPG2PVerification,
			req.BeneficiaryID, map[string]interface{}{
				"beneficiaryId": req.BeneficiaryID,
				"programId":     req.ProgramID,
				"tenantId":      req.TenantID,
				"status":        "FAILED",
				"error":         err.Error(),
				"timestamp":     time.Now().UTC().Format(time.RFC3339),
			})
		c.JSON(http.StatusBadGateway, gin.H{
			"beneficiaryId": req.BeneficiaryID,
			"verified":      false,
			"error":         err.Error(),
		})
		return
	}

	// Publish G2P verification success
	_ = h.Kafka.Publish(c.Request.Context(), kafka.TopicMOSIPG2PVerification,
		req.BeneficiaryID, map[string]interface{}{
			"beneficiaryId": req.BeneficiaryID,
			"programId":     req.ProgramID,
			"tenantId":      req.TenantID,
			"status":        "VERIFIED",
			"responseTime":  ekycResp.ResponseTime,
			"timestamp":     time.Now().UTC().Format(time.RFC3339),
		})

	h.Log.Info("mosip.g2p.verify.success",
		zap.String("beneficiaryId", req.BeneficiaryID),
		zap.String("programId", req.ProgramID),
	)

	c.JSON(http.StatusOK, gin.H{
		"beneficiaryId": req.BeneficiaryID,
		"verified":      true,
		"kycData":       ekycResp.Response,
		"transactionId": ekycResp.TransactionID,
	})
}

// ─── Registration: Pre-registration ──────────────────────────────────────────

// PreRegCreateRequest is the request body for creating a pre-registration application.
type PreRegCreateRequest struct {
DemographicDetails mosip.DemographicDetails `json:"demographicDetails" binding:"required"`
LangCode           string                   `json:"langCode" binding:"required"`
CreatedBy          string                   `json:"createdBy" binding:"required"`
AuthToken          string                   `json:"authToken" binding:"required"`
}

// HandlePreRegCreate creates a MOSIP pre-registration application for a citizen.
func (h *Handler) HandlePreRegCreate(c *gin.Context) {
if h.MOSIP == nil {
c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MOSIP client not initialised"})
return
}
var req PreRegCreateRequest
if err := c.ShouldBindJSON(&req); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
return
}
app := mosip.PreRegApplication{
DemographicDetails: req.DemographicDetails,
LangCode:           req.LangCode,
CreatedBy:          req.CreatedBy,
}
data, err := h.MOSIP.CreatePreRegistration(c.Request.Context(), app, req.AuthToken)
if err != nil {
h.Log.Error("mosip.prereg.create.error", zap.Error(err))
c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
return
}
_ = h.Kafka.Publish(c.Request.Context(), kafka.TopicMOSIPRegistration,
data.PreRegistrationID, map[string]interface{}{
"event":             "PRE_REG_CREATED",
"preRegistrationId": data.PreRegistrationID,
"createdBy":         data.CreatedBy,
"statusCode":        data.StatusCode,
"timestamp":         time.Now().UTC().Format(time.RFC3339),
})
c.JSON(http.StatusOK, gin.H{
"preRegistrationId": data.PreRegistrationID,
"statusCode":        data.StatusCode,
"createdDateTime":   data.CreatedDateTime,
})
}

// HandlePreRegGet fetches a pre-registration application by AID.
func (h *Handler) HandlePreRegGet(c *gin.Context) {
if h.MOSIP == nil {
c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MOSIP client not initialised"})
return
}
aid := c.Param("aid")
authToken := c.GetHeader("Authorization")
if authToken == "" {
c.JSON(http.StatusUnauthorized, gin.H{"error": "missing Authorization header"})
return
}
if len(authToken) > 7 && authToken[:7] == "Bearer " {
authToken = authToken[7:]
}
data, err := h.MOSIP.GetPreRegistration(c.Request.Context(), aid, authToken)
if err != nil {
h.Log.Error("mosip.prereg.get.error", zap.String("aid", aid), zap.Error(err))
c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
return
}
c.JSON(http.StatusOK, data)
}

// ─── Registration: Appointment ────────────────────────────────────────────────

// AppointmentBookRequest is the request body for booking a registration appointment.
type AppointmentBookRequest struct {
PreRegistrationID    string `json:"preRegistrationId" binding:"required"`
RegistrationCenterID string `json:"registrationCenterId" binding:"required"`
SlotFromTime         string `json:"slotFromTime" binding:"required"`
SlotToTime           string `json:"slotToTime" binding:"required"`
AppointmentDate      string `json:"appointmentDate" binding:"required"`
AuthToken            string `json:"authToken" binding:"required"`
}

// HandleBookAppointment books a registration center appointment.
func (h *Handler) HandleBookAppointment(c *gin.Context) {
if h.MOSIP == nil {
c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MOSIP client not initialised"})
return
}
var req AppointmentBookRequest
if err := c.ShouldBindJSON(&req); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
return
}
apptReq := mosip.AppointmentRequest{
PreRegistrationID:    req.PreRegistrationID,
RegistrationCenterID: req.RegistrationCenterID,
SlotFromTime:         req.SlotFromTime,
SlotToTime:           req.SlotToTime,
AppointmentDate:      req.AppointmentDate,
}
if err := h.MOSIP.BookAppointment(c.Request.Context(), apptReq, req.AuthToken); err != nil {
h.Log.Error("mosip.appointment.book.error", zap.Error(err))
c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
return
}
_ = h.Kafka.Publish(c.Request.Context(), kafka.TopicMOSIPRegistration,
req.PreRegistrationID, map[string]interface{}{
"event":             "APPOINTMENT_BOOKED",
"preRegistrationId": req.PreRegistrationID,
"centerId":          req.RegistrationCenterID,
"appointmentDate":   req.AppointmentDate,
"timestamp":         time.Now().UTC().Format(time.RFC3339),
})
c.JSON(http.StatusOK, gin.H{
"preRegistrationId": req.PreRegistrationID,
"status":            "BOOKED",
"appointmentDate":   req.AppointmentDate,
"centerId":          req.RegistrationCenterID,
})
}

// HandleCancelAppointment cancels a booked appointment.
func (h *Handler) HandleCancelAppointment(c *gin.Context) {
if h.MOSIP == nil {
c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MOSIP client not initialised"})
return
}
aid := c.Param("aid")
authToken := c.GetHeader("Authorization")
if authToken == "" {
c.JSON(http.StatusUnauthorized, gin.H{"error": "missing Authorization header"})
return
}
if len(authToken) > 7 && authToken[:7] == "Bearer " {
authToken = authToken[7:]
}
if err := h.MOSIP.CancelAppointment(c.Request.Context(), aid, authToken); err != nil {
h.Log.Error("mosip.appointment.cancel.error", zap.String("aid", aid), zap.Error(err))
c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
return
}
c.JSON(http.StatusOK, gin.H{"preRegistrationId": aid, "status": "CANCELLED"})
}

// ─── Registration: Packet Upload ─────────────────────────────────────────────

// PacketUploadRequest is the request body for uploading a registration packet.
type PacketUploadRequest struct {
PacketID          string `json:"packetId" binding:"required"`
PacketName        string `json:"packetName" binding:"required"`
PacketContent     string `json:"packetContent" binding:"required"`
Source            string `json:"source"`
Process           string `json:"process"`
SchemaVersion     string `json:"schemaVersion"`
SchemaHash        string `json:"schemaHash"`
SupervisorStatus  string `json:"supervisorStatus"`
SupervisorComment string `json:"supervisorComment"`
}

// HandlePacketUpload uploads an encrypted registration packet to the Registration Processor.
func (h *Handler) HandlePacketUpload(c *gin.Context) {
if h.MOSIP == nil {
c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MOSIP client not initialised"})
return
}
var req PacketUploadRequest
if err := c.ShouldBindJSON(&req); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
return
}
if req.Source == "" {
req.Source = "NEXTHUB"
}
if req.Process == "" {
req.Process = "NEW"
}
if req.SupervisorStatus == "" {
req.SupervisorStatus = "APPROVED"
}
packetData := mosip.PacketData{
PacketID:          req.PacketID,
PacketName:        req.PacketName,
PacketContent:     req.PacketContent,
Source:            req.Source,
Process:           req.Process,
SchemaVersion:     req.SchemaVersion,
SchemaHash:        req.SchemaHash,
SupervisorStatus:  req.SupervisorStatus,
SupervisorComment: req.SupervisorComment,
}
rid, err := h.MOSIP.UploadRegistrationPacket(c.Request.Context(), packetData)
if err != nil {
h.Log.Error("mosip.packet.upload.error", zap.Error(err))
c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
return
}
_ = h.Kafka.Publish(c.Request.Context(), kafka.TopicMOSIPRegistration,
rid, map[string]interface{}{
"event":          "PACKET_UPLOADED",
"registrationId": rid,
"packetId":       req.PacketID,
"process":        req.Process,
"timestamp":      time.Now().UTC().Format(time.RFC3339),
})
h.Log.Info("mosip.packet.upload.success", zap.String("rid", rid))
c.JSON(http.StatusOK, gin.H{"registrationId": rid, "status": "RECEIVED"})
}

// HandlePacketStatus checks the processing status of a registration packet by RID.
func (h *Handler) HandlePacketStatus(c *gin.Context) {
if h.MOSIP == nil {
c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MOSIP client not initialised"})
return
}
rid := c.Param("rid")
statuses, err := h.MOSIP.GetPacketStatus(c.Request.Context(), rid)
if err != nil {
h.Log.Error("mosip.packet.status.error", zap.String("rid", rid), zap.Error(err))
c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
return
}
c.JSON(http.StatusOK, gin.H{"registrationId": rid, "statuses": statuses})
}

// ─── Registration: UIN Lifecycle ─────────────────────────────────────────────

// HandleUINStatus fetches the identity data for a UIN from the ID repository.
func (h *Handler) HandleUINStatus(c *gin.Context) {
if h.MOSIP == nil {
c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MOSIP client not initialised"})
return
}
uin := c.Param("uin")
authToken := c.GetHeader("Authorization")
if authToken == "" {
c.JSON(http.StatusUnauthorized, gin.H{"error": "missing Authorization header"})
return
}
if len(authToken) > 7 && authToken[:7] == "Bearer " {
authToken = authToken[7:]
}
data, err := h.MOSIP.GetUINIdentity(c.Request.Context(), uin, authToken)
if err != nil {
h.Log.Error("mosip.uin.status.error", zap.String("uin", uin), zap.Error(err))
c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
return
}
c.JSON(http.StatusOK, gin.H{"uin": uin, "status": data.Status, "entity": data.Entity})
}

// UINUpdateRequest is the request body for updating a UIN's identity.
type UINUpdateRequest struct {
UIN            string                    `json:"uin" binding:"required"`
RegistrationID string                    `json:"registrationId" binding:"required"`
Identity       mosip.Identity            `json:"identity" binding:"required"`
Documents      []mosip.IdentityDoc       `json:"documents,omitempty"`
Biometrics     []mosip.IdentityBiometric `json:"biometrics,omitempty"`
AuthToken      string                    `json:"authToken" binding:"required"`
}

// HandleUINUpdate updates the identity data for a UIN.
func (h *Handler) HandleUINUpdate(c *gin.Context) {
if h.MOSIP == nil {
c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MOSIP client not initialised"})
return
}
var req UINUpdateRequest
if err := c.ShouldBindJSON(&req); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
return
}
data := mosip.UINIdentityData{
RegistrationID: req.RegistrationID,
Identity:       req.Identity,
Documents:      req.Documents,
Biometrics:     req.Biometrics,
}
if err := h.MOSIP.UpdateUINIdentity(c.Request.Context(), req.UIN, data, req.AuthToken); err != nil {
h.Log.Error("mosip.uin.update.error", zap.String("uin", req.UIN), zap.Error(err))
c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
return
}
_ = h.Kafka.Publish(c.Request.Context(), kafka.TopicMOSIPRegistration,
req.UIN, map[string]interface{}{
"event":          "UIN_UPDATED",
"uin":            req.UIN,
"registrationId": req.RegistrationID,
"timestamp":      time.Now().UTC().Format(time.RFC3339),
})
c.JSON(http.StatusOK, gin.H{"uin": req.UIN, "status": "UPDATED"})
}

// UINLockHandlerRequest is the request body for locking/unlocking a UIN.
type UINLockHandlerRequest struct {
UINHash   string `json:"uinHash" binding:"required"`
SaltValue string `json:"saltValue" binding:"required"`
AuthType  string `json:"authType" binding:"required"`
AuthToken string `json:"authToken" binding:"required"`
}

// HandleUINLock locks specific authentication types for a UIN.
func (h *Handler) HandleUINLock(c *gin.Context) {
if h.MOSIP == nil {
c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MOSIP client not initialised"})
return
}
var req UINLockHandlerRequest
if err := c.ShouldBindJSON(&req); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
return
}
if err := h.MOSIP.LockUIN(c.Request.Context(), req.UINHash, req.SaltValue, req.AuthType, req.AuthToken); err != nil {
h.Log.Error("mosip.uin.lock.error", zap.Error(err))
c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
return
}
_ = h.Kafka.Publish(c.Request.Context(), kafka.TopicMOSIPRegistration,
req.UINHash, map[string]interface{}{
"event":     "UIN_LOCKED",
"uinHash":   req.UINHash,
"authType":  req.AuthType,
"timestamp": time.Now().UTC().Format(time.RFC3339),
})
c.JSON(http.StatusOK, gin.H{"uinHash": req.UINHash, "authType": req.AuthType, "status": "LOCKED"})
}

// HandleUINUnlock unlocks specific authentication types for a UIN.
func (h *Handler) HandleUINUnlock(c *gin.Context) {
if h.MOSIP == nil {
c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MOSIP client not initialised"})
return
}
var req UINLockHandlerRequest
if err := c.ShouldBindJSON(&req); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
return
}
if err := h.MOSIP.UnlockUIN(c.Request.Context(), req.UINHash, req.SaltValue, req.AuthType, req.AuthToken); err != nil {
h.Log.Error("mosip.uin.unlock.error", zap.Error(err))
c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
return
}
_ = h.Kafka.Publish(c.Request.Context(), kafka.TopicMOSIPRegistration,
req.UINHash, map[string]interface{}{
"event":     "UIN_UNLOCKED",
"uinHash":   req.UINHash,
"authType":  req.AuthType,
"timestamp": time.Now().UTC().Format(time.RFC3339),
})
c.JSON(http.StatusOK, gin.H{"uinHash": req.UINHash, "authType": req.AuthType, "status": "UNLOCKED"})
}

// ─── Registration: VID Generation ────────────────────────────────────────────

// VIDGenerateRequest is the request body for generating a VID.
type VIDGenerateRequest struct {
UIN       string `json:"uin" binding:"required"`
VIDType   string `json:"vidType"`
AuthToken string `json:"authToken" binding:"required"`
}

// HandleVIDGenerate generates a Virtual ID (VID) for a UIN.
func (h *Handler) HandleVIDGenerate(c *gin.Context) {
if h.MOSIP == nil {
c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MOSIP client not initialised"})
return
}
var req VIDGenerateRequest
if err := c.ShouldBindJSON(&req); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
return
}
if req.VIDType == "" {
req.VIDType = "PERPETUAL"
}
result, err := h.MOSIP.GenerateVID(c.Request.Context(), req.UIN, req.VIDType, req.AuthToken)
if err != nil {
h.Log.Error("mosip.vid.generate.error", zap.Error(err))
c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
return
}
_ = h.Kafka.Publish(c.Request.Context(), kafka.TopicMOSIPRegistration,
result.VID, map[string]interface{}{
"event":      "VID_GENERATED",
"vid":        result.VID,
"vidType":    result.VIDType,
"expiryTime": result.ExpiryTime,
"timestamp":  time.Now().UTC().Format(time.RFC3339),
})
h.Log.Info("mosip.vid.generate.success", zap.String("vidType", result.VIDType))
c.JSON(http.StatusOK, gin.H{
"vid":         result.VID,
"vidType":     result.VIDType,
"expiryTime":  result.ExpiryTime,
"generatedOn": result.GeneratedOn,
})
}

// ─── Registration: Credential Issuance ───────────────────────────────────────

// CredentialRequestBody is the request body for requesting a national ID credential.
type CredentialRequestBody struct {
CredentialType  string            `json:"credentialType"`
Issuer          string            `json:"issuer"`
RecepientID     string            `json:"recepientId" binding:"required"`
RecepientIDType string            `json:"recepientIdType"`
Shareable       bool              `json:"shareable"`
AdditionalData  map[string]string `json:"additionalData,omitempty"`
AuthToken       string            `json:"authToken" binding:"required"`
}

// HandleCredentialRequest requests generation of a national ID credential.
func (h *Handler) HandleCredentialRequest(c *gin.Context) {
if h.MOSIP == nil {
c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MOSIP client not initialised"})
return
}
var req CredentialRequestBody
if err := c.ShouldBindJSON(&req); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
return
}
if req.CredentialType == "" {
req.CredentialType = "pdf"
}
if req.RecepientIDType == "" {
req.RecepientIDType = "UIN"
}
issueData := mosip.CredentialIssueData{
CredentialType:  req.CredentialType,
Issuer:          req.Issuer,
RecepientID:     req.RecepientID,
RecepientIDType: req.RecepientIDType,
Shareable:       req.Shareable,
AdditionalData:  req.AdditionalData,
}
requestID, err := h.MOSIP.RequestCredentialIssuance(c.Request.Context(), issueData, req.AuthToken)
if err != nil {
h.Log.Error("mosip.credential.request.error", zap.Error(err))
c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
return
}
_ = h.Kafka.Publish(c.Request.Context(), kafka.TopicMOSIPRegistration,
requestID, map[string]interface{}{
"event":          "CREDENTIAL_REQUESTED",
"requestId":      requestID,
"credentialType": req.CredentialType,
"recepientId":    req.RecepientID,
"timestamp":      time.Now().UTC().Format(time.RFC3339),
})
h.Log.Info("mosip.credential.request.success", zap.String("requestId", requestID))
c.JSON(http.StatusOK, gin.H{"requestId": requestID, "status": "REQUESTED"})
}

// HandleCredentialStatus checks the status of a credential generation request.
func (h *Handler) HandleCredentialStatus(c *gin.Context) {
if h.MOSIP == nil {
c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MOSIP client not initialised"})
return
}
requestID := c.Param("requestId")
authToken := c.GetHeader("Authorization")
if authToken == "" {
c.JSON(http.StatusUnauthorized, gin.H{"error": "missing Authorization header"})
return
}
if len(authToken) > 7 && authToken[:7] == "Bearer " {
authToken = authToken[7:]
}
status, err := h.MOSIP.GetCredentialStatus(c.Request.Context(), requestID, authToken)
if err != nil {
h.Log.Error("mosip.credential.status.error", zap.String("requestId", requestID), zap.Error(err))
c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
return
}
c.JSON(http.StatusOK, status)
}
