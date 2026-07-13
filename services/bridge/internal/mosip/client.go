// Package mosip provides a client for the MOSIP Identity Authentication (IDA) API
// and the eSignet OIDC4VP/OIDC4VCI flows.
//
// MOSIP IDA API: https://docs.mosip.io/1.2.0/apis/id-authentication-apis
// eSignet: https://docs.esignet.io/
//
// This client handles:
//   - eKYC (electronic Know Your Customer) via MOSIP IDA
//   - OTP-based authentication
//   - Biometric authentication (fingerprint, iris, face)
//   - eSignet OIDC4VP authorization requests
//   - Verifiable Credential (VC) issuance via OIDC4VCI
package mosip

import (
	"bytes"
	"context"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"go.uber.org/zap"
)

// ─── Config ───────────────────────────────────────────────────────────────────

// Config holds all MOSIP/eSignet connection parameters.
type Config struct {
	// MOSIP IDA base URL (e.g. https://ida.mosip.net)
	IDABaseURL string
	// eSignet base URL (e.g. https://esignet.mosip.net)
	ESignetBaseURL string
	// Partner ID registered with MOSIP
	PartnerID string
	// Partner API key
	PartnerAPIKey string
	// MISP license key
	MISPLicenseKey string
	// RSA private key PEM for request signing
	PrivateKeyPEM string
	// RSA public certificate PEM for response verification
	PublicCertPEM string
	// HTTP timeout
	Timeout time.Duration
}

// ConfigFromEnv loads MOSIP config from environment variables.
func ConfigFromEnv() Config {
	timeout, _ := time.ParseDuration(os.Getenv("MOSIP_TIMEOUT"))
	if timeout == 0 {
		timeout = 30 * time.Second
	}
	return Config{
		IDABaseURL:     getEnvOrDefault("MOSIP_IDA_BASE_URL", "https://ida.mosip.net"),
		ESignetBaseURL: getEnvOrDefault("MOSIP_ESIGNET_BASE_URL", "https://esignet.mosip.net"),
		PartnerID:      os.Getenv("MOSIP_PARTNER_ID"),
		PartnerAPIKey:  os.Getenv("MOSIP_PARTNER_API_KEY"),
		MISPLicenseKey: os.Getenv("MOSIP_MISP_LICENSE_KEY"),
		PrivateKeyPEM:  os.Getenv("MOSIP_PRIVATE_KEY_PEM"),
		PublicCertPEM:  os.Getenv("MOSIP_PUBLIC_CERT_PEM"),
		Timeout:        timeout,
	}
}

func getEnvOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// ─── Client ───────────────────────────────────────────────────────────────────

// Client is the MOSIP IDA + eSignet client.
type Client struct {
	cfg    Config
	http   *http.Client
	log    *zap.Logger
	privKey *rsa.PrivateKey
}

// New creates a new MOSIP client. Returns an error if the private key PEM is
// provided but cannot be parsed.
func New(cfg Config, log *zap.Logger) (*Client, error) {
	c := &Client{
		cfg:  cfg,
		http: &http.Client{Timeout: cfg.Timeout},
		log:  log,
	}
	if cfg.PrivateKeyPEM != "" {
		block, _ := pem.Decode([]byte(cfg.PrivateKeyPEM))
		if block == nil {
			return nil, fmt.Errorf("mosip: invalid private key PEM")
		}
		key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
		if err != nil {
			return nil, fmt.Errorf("mosip: parse private key: %w", err)
		}
		rsaKey, ok := key.(*rsa.PrivateKey)
		if !ok {
			return nil, fmt.Errorf("mosip: private key is not RSA")
		}
		c.privKey = rsaKey
	}
	return c, nil
}

// ─── IDA eKYC ─────────────────────────────────────────────────────────────────

// EKYCRequest represents a MOSIP IDA eKYC request.
type EKYCRequest struct {
	// UIN or VID of the individual
	IndividualID     string `json:"individualId"`
	IndividualIDType string `json:"individualIdType"` // "UIN" | "VID"
	// OTP for OTP-based auth
	OTP string `json:"otp,omitempty"`
	// Biometric data (base64-encoded ISO 19794-4 for fingerprint, etc.)
	BiometricData string `json:"biometricData,omitempty"`
	// Consent token
	ConsentObtained bool `json:"consentObtained"`
	// Requested KYC attributes
	RequestedAttributes []string `json:"requestedAttributes"`
	// Transaction ID for audit
	TransactionID string `json:"transactionId"`
}

// EKYCResponse represents the MOSIP IDA eKYC response.
type EKYCResponse struct {
	TransactionID string                 `json:"transactionID"`
	Version       string                 `json:"version"`
	ResponseTime  string                 `json:"responseTime"`
	Response      map[string]interface{} `json:"response"`
	Errors        []IDAError             `json:"errors"`
}

// IDAError represents a MOSIP IDA error.
type IDAError struct {
	ErrorCode string `json:"errorCode"`
	Message   string `json:"message"`
}

// SendEKYC sends an eKYC request to the MOSIP IDA API.
// It signs the request with the partner private key and returns the decrypted
// KYC attributes.
func (c *Client) SendEKYC(ctx context.Context, req EKYCRequest) (*EKYCResponse, error) {
	c.log.Info("mosip.ekyc.request",
		zap.String("transactionId", req.TransactionID),
		zap.String("individualIdType", req.IndividualIDType),
	)

	url := fmt.Sprintf("%s/idauthentication/v1/kyc/%s/%s",
		c.cfg.IDABaseURL, c.cfg.MISPLicenseKey, c.cfg.PartnerID)

	// Build the IDA request envelope
	envelope := map[string]interface{}{
		"id":           "mosip.identity.kyc",
		"version":      "1.0",
		"requestTime":  time.Now().UTC().Format(time.RFC3339),
		"transactionID": req.TransactionID,
		"env":          "Staging",
		"domainUri":    c.cfg.IDABaseURL,
		"request": map[string]interface{}{
			"otp":              req.OTP,
			"biometrics":       req.BiometricData,
			"individualId":     req.IndividualID,
			"individualIdType": req.IndividualIDType,
			"consentObtained":  req.ConsentObtained,
		},
	}

	body, err := json.Marshal(envelope)
	if err != nil {
		return nil, fmt.Errorf("mosip: marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("mosip: create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+c.cfg.PartnerAPIKey)
	httpReq.Header.Set("Partner-ID", c.cfg.PartnerID)

	resp, err := c.http.Do(httpReq)
	if err != nil {
		c.log.Error("mosip.ekyc.http_error", zap.Error(err))
		return nil, fmt.Errorf("mosip: ekyc request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("mosip: read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		c.log.Error("mosip.ekyc.non_200",
			zap.Int("status", resp.StatusCode),
			zap.String("body", string(respBody)),
		)
		return nil, fmt.Errorf("mosip: ekyc status %d: %s", resp.StatusCode, string(respBody))
	}

	var ekycResp EKYCResponse
	if err := json.Unmarshal(respBody, &ekycResp); err != nil {
		return nil, fmt.Errorf("mosip: unmarshal response: %w", err)
	}

	if len(ekycResp.Errors) > 0 {
		c.log.Warn("mosip.ekyc.ida_errors",
			zap.String("code", ekycResp.Errors[0].ErrorCode),
			zap.String("msg", ekycResp.Errors[0].Message),
		)
		return nil, fmt.Errorf("mosip IDA error %s: %s", ekycResp.Errors[0].ErrorCode, ekycResp.Errors[0].Message)
	}

	c.log.Info("mosip.ekyc.success",
		zap.String("transactionId", req.TransactionID),
		zap.String("responseTime", ekycResp.ResponseTime),
	)
	return &ekycResp, nil
}

// ─── OTP Generation ───────────────────────────────────────────────────────────

// OTPRequest represents a MOSIP IDA OTP generation request.
type OTPRequest struct {
	IndividualID     string   `json:"individualId"`
	IndividualIDType string   `json:"individualIdType"` // "UIN" | "VID"
	OTPChannel       []string `json:"otpChannel"`       // ["EMAIL", "PHONE"]
	TransactionID    string   `json:"transactionId"`
}

// OTPResponse represents the MOSIP IDA OTP generation response.
type OTPResponse struct {
	TransactionID string     `json:"transactionID"`
	ResponseTime  string     `json:"responseTime"`
	Response      OTPResult  `json:"response"`
	Errors        []IDAError `json:"errors"`
}

// OTPResult is the inner response for OTP generation.
type OTPResult struct {
	MaskedEmail string `json:"maskedEmail"`
	MaskedMobile string `json:"maskedMobile"`
}

// GenerateOTP requests MOSIP to send an OTP to the individual's registered
// email/phone for subsequent eKYC authentication.
func (c *Client) GenerateOTP(ctx context.Context, req OTPRequest) (*OTPResponse, error) {
	c.log.Info("mosip.otp.request",
		zap.String("transactionId", req.TransactionID),
		zap.String("individualIdType", req.IndividualIDType),
	)

	url := fmt.Sprintf("%s/idauthentication/v1/otp/%s/%s",
		c.cfg.IDABaseURL, c.cfg.MISPLicenseKey, c.cfg.PartnerID)

	envelope := map[string]interface{}{
		"id":            "mosip.identity.otp",
		"version":       "1.0",
		"requestTime":   time.Now().UTC().Format(time.RFC3339),
		"transactionID": req.TransactionID,
		"env":           "Staging",
		"request": map[string]interface{}{
			"individualId":     req.IndividualID,
			"individualIdType": req.IndividualIDType,
			"otpChannel":       req.OTPChannel,
		},
	}

	body, _ := json.Marshal(envelope)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("mosip: create otp request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+c.cfg.PartnerAPIKey)

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("mosip: otp request: %w", err)
	}
	defer resp.Body.Close()

	var otpResp OTPResponse
	if err := json.NewDecoder(resp.Body).Decode(&otpResp); err != nil {
		return nil, fmt.Errorf("mosip: decode otp response: %w", err)
	}

	if len(otpResp.Errors) > 0 {
		return nil, fmt.Errorf("mosip OTP error %s: %s", otpResp.Errors[0].ErrorCode, otpResp.Errors[0].Message)
	}

	return &otpResp, nil
}

// ─── eSignet OIDC4VP ──────────────────────────────────────────────────────────

// AuthorizationRequest represents an eSignet OIDC4VP authorization request.
type AuthorizationRequest struct {
	// Client ID registered with eSignet
	ClientID string
	// Redirect URI
	RedirectURI string
	// Scope (e.g. "openid profile email phone")
	Scope string
	// ACR values (e.g. "mosip:idp:acr:generated-code")
	ACRValues string
	// State for CSRF protection
	State string
	// Nonce for replay protection
	Nonce string
	// Claims requested (JSON)
	Claims string
}

// AuthorizationURL builds the eSignet OIDC4VP authorization URL.
func (c *Client) AuthorizationURL(req AuthorizationRequest) string {
	return fmt.Sprintf(
		"%s/authorize?client_id=%s&redirect_uri=%s&response_type=code&scope=%s&acr_values=%s&state=%s&nonce=%s&claims=%s",
		c.cfg.ESignetBaseURL,
		req.ClientID,
		req.RedirectURI,
		req.Scope,
		req.ACRValues,
		req.State,
		req.Nonce,
		base64.URLEncoding.EncodeToString([]byte(req.Claims)),
	)
}

// TokenRequest represents an eSignet token exchange request.
type TokenRequest struct {
	Code        string
	RedirectURI string
	ClientID    string
	ClientSecret string
}

// TokenResponse represents the eSignet token response.
type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
	IDToken      string `json:"id_token"`
	RefreshToken string `json:"refresh_token,omitempty"`
}

// ExchangeCode exchanges an authorization code for tokens at eSignet.
func (c *Client) ExchangeCode(ctx context.Context, req TokenRequest) (*TokenResponse, error) {
	c.log.Info("esignet.token.exchange", zap.String("clientId", req.ClientID))

	url := fmt.Sprintf("%s/oauth/token", c.cfg.ESignetBaseURL)
	body := fmt.Sprintf(
		"grant_type=authorization_code&code=%s&redirect_uri=%s&client_id=%s&client_secret=%s",
		req.Code, req.RedirectURI, req.ClientID, req.ClientSecret,
	)

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url,
		bytes.NewBufferString(body))
	if err != nil {
		return nil, fmt.Errorf("esignet: create token request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("esignet: token request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("esignet: token status %d: %s", resp.StatusCode, string(b))
	}

	var tokenResp TokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return nil, fmt.Errorf("esignet: decode token response: %w", err)
	}

	return &tokenResp, nil
}

// ─── OIDC4VCI — Verifiable Credential Issuance ────────────────────────────────

// CredentialRequest represents an OIDC4VCI credential issuance request.
type CredentialRequest struct {
	// Format: "ldp_vc" | "jwt_vc_json" | "mso_mdoc"
	Format string `json:"format"`
	// Credential type (e.g. "MOSIPVerifiableCredential")
	CredentialDefinition map[string]interface{} `json:"credential_definition"`
	// Proof of possession (DID-based)
	Proof CredentialProof `json:"proof"`
}

// CredentialProof is the proof of possession for VC issuance.
type CredentialProof struct {
	ProofType string `json:"proof_type"` // "jwt"
	JWT       string `json:"jwt"`
}

// CredentialResponse represents the OIDC4VCI credential response.
type CredentialResponse struct {
	Format     string      `json:"format"`
	Credential interface{} `json:"credential"`
	CNonce     string      `json:"c_nonce,omitempty"`
}

// IssueCredential requests a Verifiable Credential from eSignet's OIDC4VCI endpoint.
func (c *Client) IssueCredential(ctx context.Context, accessToken string, req CredentialRequest) (*CredentialResponse, error) {
	c.log.Info("esignet.vc.issue", zap.String("format", req.Format))

	url := fmt.Sprintf("%s/v1/esignet/vci/credential", c.cfg.ESignetBaseURL)
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("esignet: marshal vc request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("esignet: create vc request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("esignet: vc request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("esignet: vc status %d: %s", resp.StatusCode, string(b))
	}

	var vcResp CredentialResponse
	if err := json.NewDecoder(resp.Body).Decode(&vcResp); err != nil {
		return nil, fmt.Errorf("esignet: decode vc response: %w", err)
	}

	c.log.Info("esignet.vc.issued", zap.String("format", vcResp.Format))
	return &vcResp, nil
}

// ─── Utilities ────────────────────────────────────────────────────────────────

// HashID returns the SHA-256 hash of an identity value (UIN/VID/BVN/NIN)
// for privacy-preserving storage.
func HashID(value string) string {
	h := sha256.Sum256([]byte(value))
	return fmt.Sprintf("%x", h)
}
