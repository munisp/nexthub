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
