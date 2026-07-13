// Package mosip — registration.go
// Implements the MOSIP citizen registration and national ID issuance pipeline:
//
//  Stage 1 — Pre-registration  : citizen submits demographics online, books appointment, gets AID
//  Stage 2 — Registration Packet: operator captures biometrics + demographics, creates encrypted packet
//  Stage 3 — Registration Processor: validates packet, runs ABIS deduplication, issues UIN
//  Stage 4 — UIN Lifecycle     : update, lock, unlock, generate VID
//  Stage 5 — Credential Service: issue printable ID card (PDF), QR code, Verifiable Credential
//
// MOSIP API reference: https://docs.mosip.io/1.2.0/id-lifecycle-management/identity-issuance
package mosip

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// ─── Pre-registration ─────────────────────────────────────────────────────────

// PreRegApplication represents a citizen pre-registration application.
type PreRegApplication struct {
	DemographicDetails DemographicDetails `json:"demographicDetails"`
	LangCode           string             `json:"langCode"`
	CreatedBy          string             `json:"createdBy"`
}

// DemographicDetails holds the citizen's personal information.
type DemographicDetails struct {
	Identity Identity `json:"identity"`
}

// Identity holds the structured identity fields per MOSIP ID schema.
type Identity struct {
	IDSchemaVersion float64          `json:"IDSchemaVersion"`
	FullName        []LangValue      `json:"fullName"`
	DateOfBirth     string           `json:"dateOfBirth"` // YYYY/MM/DD
	Gender          []LangValue      `json:"gender"`
	ResidenceStatus []LangValue      `json:"residenceStatus"`
	AddressLine1    []LangValue      `json:"addressLine1"`
	AddressLine2    []LangValue      `json:"addressLine2,omitempty"`
	AddressLine3    []LangValue      `json:"addressLine3,omitempty"`
	Region          []LangValue      `json:"region"`
	Province        []LangValue      `json:"province"`
	City            []LangValue      `json:"city"`
	Zone            []LangValue      `json:"zone"`
	PostalCode      string           `json:"postalCode"`
	Phone           string           `json:"phone"`
	Email           string           `json:"email"`
	ProofOfAddress  *DocumentDetail  `json:"proofOfAddress,omitempty"`
	ProofOfIdentity *DocumentDetail  `json:"proofOfIdentity,omitempty"`
	ProofOfBirth    *DocumentDetail  `json:"proofOfBirth,omitempty"`
	IndividualBiometrics *BiometricRef `json:"individualBiometrics,omitempty"`
}

// LangValue holds a value in a specific language.
type LangValue struct {
	Language string `json:"language"`
	Value    string `json:"value"`
}

// DocumentDetail holds a reference to an uploaded supporting document.
type DocumentDetail struct {
	Value string `json:"value"` // document category code
}

// BiometricRef holds a reference to captured biometric data.
type BiometricRef struct {
	Format  string `json:"format"`
	Version float64 `json:"version"`
	Value   string `json:"value"` // cbeff XML reference
}

// PreRegResponse is the response from creating a pre-registration application.
type PreRegResponse struct {
	ID          string          `json:"id"`
	Version     string          `json:"version"`
	ResponseTime string         `json:"responsetime"`
	Response    *PreRegData     `json:"response"`
	Errors      []MOSIPError    `json:"errors"`
}

// PreRegData holds the AID and status of a pre-registration application.
type PreRegData struct {
	PreRegistrationID string `json:"preRegistrationId"` // AID
	CreatedBy         string `json:"createdBy"`
	CreatedDateTime   string `json:"createdDateTime"`
	UpdatedDateTime   string `json:"updatedDateTime"`
	StatusCode        string `json:"statusCode"`
}

// MOSIPError represents an error from the MOSIP API.
type MOSIPError struct {
	ErrorCode string `json:"errorCode"`
	Message   string `json:"message"`
}

// AppointmentSlot represents an available registration center time slot.
type AppointmentSlot struct {
	CenterID  string `json:"registrationCenterId"`
	SlotID    string `json:"slotId"`
	FromTime  string `json:"fromTime"`
	ToTime    string `json:"toTime"`
	Capacity  int    `json:"capacity"`
	Available int    `json:"available"`
}

// AppointmentRequest is used to book a registration appointment.
type AppointmentRequest struct {
	PreRegistrationID  string `json:"preRegistrationId"`
	RegistrationCenterID string `json:"registrationCenterId"`
	SlotFromTime       string `json:"slotFromTime"`
	SlotToTime         string `json:"slotToTime"`
	AppointmentDate    string `json:"appointmentDate"` // YYYY-MM-DD
}

// DocumentUploadResponse is the response from uploading a supporting document.
type DocumentUploadResponse struct {
	ID           string      `json:"id"`
	ResponseTime string      `json:"responsetime"`
	Response     *DocData    `json:"response"`
	Errors       []MOSIPError `json:"errors"`
}

// DocData holds the document reference ID after upload.
type DocData struct {
	PreRegistrationID string `json:"preRegistrationId"`
	DocCatCode        string `json:"docCatCode"`
	DocTypCode        string `json:"docTypCode"`
	DocFileFormat     string `json:"docFileFormat"`
	DocRefID          string `json:"docRefId"`
	DocRefURL         string `json:"docRefURL"`
}

// ─── Registration Packet ──────────────────────────────────────────────────────

// PacketRequest represents an external packet upload request to the Registration Processor.
// As of MOSIP v1.2.1.0, external systems can create and upload packets directly.
type PacketRequest struct {
	ID                string          `json:"id"`
	Version           string          `json:"version"`
	RequestTime       string          `json:"requesttime"`
	Request           PacketData      `json:"request"`
}

// PacketData holds the encrypted registration packet.
type PacketData struct {
	PacketID          string `json:"packetId"`          // RID — Registration ID
	PacketName        string `json:"packetName"`        // {RID}.zip
	PacketContent     string `json:"packetContent"`     // base64-encoded encrypted zip
	Source            string `json:"source"`            // e.g. "NEXTHUB"
	Process           string `json:"process"`           // "NEW", "UPDATE", "LOST"
	SchemaVersion     string `json:"schemaVersion"`
	SchemaHash        string `json:"schemaHash"`
	SupervisorStatus  string `json:"supervisorStatus"`  // "APPROVED"
	SupervisorComment string `json:"supervisorComment"`
}

// PacketStatusResponse is the response from checking packet processing status.
type PacketStatusResponse struct {
	ID           string          `json:"id"`
	ResponseTime string          `json:"responsetime"`
	Response     []PacketStatus  `json:"response"`
	Errors       []MOSIPError    `json:"errors"`
}

// PacketStatus holds the processing status of a registration packet.
type PacketStatus struct {
	RegistrationID    string `json:"registrationId"` // RID
	StatusCode        string `json:"statusCode"`
	StatusComment     string `json:"statusComment"`
	SubStatusCode     string `json:"subStatusCode"`
	TransactionTypeCode string `json:"transactionTypeCode"`
	UpdatedDateTime   string `json:"updatedDateTime"`
}

// ─── UIN Lifecycle ────────────────────────────────────────────────────────────

// UINIdentityRequest is used to create or update a UIN in the ID repository.
type UINIdentityRequest struct {
	ID          string          `json:"id"`
	Version     string          `json:"version"`
	RequestTime string          `json:"requesttime"`
	Request     UINIdentityData `json:"request"`
}

// UINIdentityData holds the identity data for UIN creation/update.
type UINIdentityData struct {
	RegistrationID string          `json:"registrationId"`
	Identity       Identity        `json:"identity"`
	Documents      []IdentityDoc   `json:"documents,omitempty"`
	Biometrics     []IdentityBiometric `json:"biometrics,omitempty"`
}

// IdentityDoc holds a document associated with a UIN.
type IdentityDoc struct {
	Category string `json:"category"`
	Value    string `json:"value"` // base64-encoded document
}

// IdentityBiometric holds biometric data associated with a UIN.
type IdentityBiometric struct {
	Type  string `json:"type"`  // "individualBiometrics"
	Value string `json:"value"` // base64-encoded CBEFF XML
}

// UINResponse is the response from creating or fetching a UIN.
type UINResponse struct {
	ID           string      `json:"id"`
	ResponseTime string      `json:"responsetime"`
	Response     *UINData    `json:"response"`
	Errors       []MOSIPError `json:"errors"`
}

// UINData holds the UIN and status.
type UINData struct {
	Status string `json:"status"`
	Entity string `json:"entity"` // JSON string of the identity
}

// UINLockRequest is used to lock or unlock a UIN.
type UINLockRequest struct {
	ID          string          `json:"id"`
	Version     string          `json:"version"`
	RequestTime string          `json:"requesttime"`
	Request     UINLockData     `json:"request"`
}

// UINLockData holds the UIN and the auth types to lock/unlock.
type UINLockData struct {
	HashAttributes []HashAttribute `json:"hashAttributes"`
}

// HashAttribute holds a UIN hash and the auth type to lock/unlock.
type HashAttribute struct {
	HashValue    string `json:"hashValue"`    // SHA-256 of UIN
	SaltValue    string `json:"saltValue"`
	AuthType     string `json:"authType"`     // "bio", "otp", "demo"
	RequestType  string `json:"requestType"`  // "LOCK" or "UNLOCK"
}

// VIDRequest is used to generate a Virtual ID (VID) for a UIN.
type VIDRequest struct {
	ID          string      `json:"id"`
	Version     string      `json:"version"`
	RequestTime string      `json:"requesttime"`
	Request     VIDData     `json:"request"`
}

// VIDData holds the UIN for which to generate a VID.
type VIDData struct {
	UIN     string `json:"uin"`
	VIDType string `json:"vidType"` // "PERPETUAL" or "TEMPORARY"
}

// VIDResponse is the response from generating a VID.
type VIDResponse struct {
	ID           string      `json:"id"`
	ResponseTime string      `json:"responsetime"`
	Response     *VIDResult  `json:"response"`
	Errors       []MOSIPError `json:"errors"`
}

// VIDResult holds the generated VID.
type VIDResult struct {
	VID          string `json:"vid"`
	VIDType      string `json:"vidType"`
	UIN          string `json:"uin"`
	ExpiryTime   string `json:"expiryTime"`
	GeneratedOn  string `json:"generatedOn"`
}

// ─── Credential Service ───────────────────────────────────────────────────────

// CredentialIssuanceRequest requests generation of a national ID credential.
type CredentialIssuanceRequest struct {
	ID          string              `json:"id"`
	Version     string              `json:"version"`
	RequestTime string              `json:"requesttime"`
	Request     CredentialIssueData `json:"request"`
}

// CredentialIssueData holds the parameters for credential generation.
type CredentialIssueData struct {
	CredentialType  string            `json:"credentialType"` // "pdf", "qrcode", "euin", "vercred"
	Issuer          string            `json:"issuer"`
	EncryptionKey   string            `json:"encryptionKey,omitempty"`
	RecepientID     string            `json:"recepientId"`    // UIN or VID
	RecepientIDType string            `json:"recepientIdType"` // "UIN" or "VID"
	Shareable       bool              `json:"shareable"`
	AdditionalData  map[string]string `json:"additionalData,omitempty"`
}

// CredentialStatusResponse is the response from checking credential generation status.
type CredentialStatusResponse struct {
	ID           string              `json:"id"`
	ResponseTime string              `json:"responsetime"`
	Response     *CredentialStatus   `json:"response"`
	Errors       []MOSIPError        `json:"errors"`
}

// CredentialStatus holds the status and download URL of a generated credential.
type CredentialStatus struct {
	RequestID     string `json:"requestId"`
	CredentialType string `json:"credentialType"`
	Status        string `json:"status"` // "ISSUED", "PRINTING", "ERROR"
	StatusComment string `json:"statusComment"`
	DataShareURL  string `json:"dataShareUrl,omitempty"` // download URL for PDF/QR
	UpdatedDateTime string `json:"updatedDateTime"`
}

// ─── Registration Center ──────────────────────────────────────────────────────

// RegistrationCenter holds details about a MOSIP registration center.
type RegistrationCenter struct {
	ID              string  `json:"id"`
	Name            string  `json:"name"`
	AddressLine1    string  `json:"addressLine1"`
	AddressLine2    string  `json:"addressLine2"`
	AddressLine3    string  `json:"addressLine3"`
	Latitude        float64 `json:"latitude"`
	Longitude       float64 `json:"longitude"`
	ContactPhone    string  `json:"contactPhone"`
	WorkingHours    string  `json:"workingHours"`
	IsActive        bool    `json:"isActive"`
}

// ─── Client methods ───────────────────────────────────────────────────────────

// CreatePreRegistration submits a citizen's demographic data to the MOSIP
// pre-registration service and returns an AID (Application ID).
func (c *Client) CreatePreRegistration(ctx context.Context, app PreRegApplication, authToken string) (*PreRegData, error) {
	body, _ := json.Marshal(map[string]interface{}{
		"id":          "mosip.pre-registration.demographic.create",
		"version":     "1.0",
		"requesttime": time.Now().UTC().Format(time.RFC3339),
		"request":     app,
	})
	resp, err := c.doAuthedRequest(ctx, http.MethodPost,
		c.cfg.PreRegBaseURL+"/preregistration/v1/applications",
		authToken, body)
	if err != nil {
		return nil, fmt.Errorf("pre-registration create: %w", err)
	}
	var out PreRegResponse
	if err := json.Unmarshal(resp, &out); err != nil {
		return nil, fmt.Errorf("pre-registration create decode: %w", err)
	}
	if len(out.Errors) > 0 {
		return nil, fmt.Errorf("mosip error %s: %s", out.Errors[0].ErrorCode, out.Errors[0].Message)
	}
	return out.Response, nil
}

// GetPreRegistration fetches the status and data of a pre-registration application by AID.
func (c *Client) GetPreRegistration(ctx context.Context, aid, authToken string) (*PreRegData, error) {
	resp, err := c.doAuthedRequest(ctx, http.MethodGet,
		c.cfg.PreRegBaseURL+"/preregistration/v1/applications/"+aid,
		authToken, nil)
	if err != nil {
		return nil, fmt.Errorf("pre-registration get: %w", err)
	}
	var out PreRegResponse
	if err := json.Unmarshal(resp, &out); err != nil {
		return nil, fmt.Errorf("pre-registration get decode: %w", err)
	}
	if len(out.Errors) > 0 {
		return nil, fmt.Errorf("mosip error %s: %s", out.Errors[0].ErrorCode, out.Errors[0].Message)
	}
	return out.Response, nil
}

// GetRegistrationCenters fetches registration centers near a given location.
func (c *Client) GetRegistrationCenters(ctx context.Context, langCode, hierarchyLevel, textValue, authToken string) ([]RegistrationCenter, error) {
	url := fmt.Sprintf("%s/preregistration/v1/registrationcenters/%s/%s/%s",
		c.cfg.PreRegBaseURL, langCode, hierarchyLevel, textValue)
	resp, err := c.doAuthedRequest(ctx, http.MethodGet, url, authToken, nil)
	if err != nil {
		return nil, fmt.Errorf("get registration centers: %w", err)
	}
	var out struct {
		Response []RegistrationCenter `json:"response"`
		Errors   []MOSIPError         `json:"errors"`
	}
	if err := json.Unmarshal(resp, &out); err != nil {
		return nil, fmt.Errorf("get registration centers decode: %w", err)
	}
	if len(out.Errors) > 0 {
		return nil, fmt.Errorf("mosip error %s: %s", out.Errors[0].ErrorCode, out.Errors[0].Message)
	}
	return out.Response, nil
}

// GetAvailableSlots fetches available appointment slots for a registration center.
func (c *Client) GetAvailableSlots(ctx context.Context, centerID, date, authToken string) ([]AppointmentSlot, error) {
	url := fmt.Sprintf("%s/preregistration/v1/appointment/availability/%s?date=%s",
		c.cfg.PreRegBaseURL, centerID, date)
	resp, err := c.doAuthedRequest(ctx, http.MethodGet, url, authToken, nil)
	if err != nil {
		return nil, fmt.Errorf("get available slots: %w", err)
	}
	var out struct {
		Response []AppointmentSlot `json:"response"`
		Errors   []MOSIPError      `json:"errors"`
	}
	if err := json.Unmarshal(resp, &out); err != nil {
		return nil, fmt.Errorf("get available slots decode: %w", err)
	}
	if len(out.Errors) > 0 {
		return nil, fmt.Errorf("mosip error %s: %s", out.Errors[0].ErrorCode, out.Errors[0].Message)
	}
	return out.Response, nil
}

// BookAppointment books a registration center appointment for a pre-registration application.
func (c *Client) BookAppointment(ctx context.Context, req AppointmentRequest, authToken string) error {
	body, _ := json.Marshal(map[string]interface{}{
		"id":          "mosip.pre-registration.appointment.book",
		"version":     "1.0",
		"requesttime": time.Now().UTC().Format(time.RFC3339),
		"request":     req,
	})
	resp, err := c.doAuthedRequest(ctx, http.MethodPost,
		c.cfg.PreRegBaseURL+"/preregistration/v1/appointment",
		authToken, body)
	if err != nil {
		return fmt.Errorf("book appointment: %w", err)
	}
	var out struct {
		Errors []MOSIPError `json:"errors"`
	}
	if err := json.Unmarshal(resp, &out); err != nil {
		return fmt.Errorf("book appointment decode: %w", err)
	}
	if len(out.Errors) > 0 {
		return fmt.Errorf("mosip error %s: %s", out.Errors[0].ErrorCode, out.Errors[0].Message)
	}
	return nil
}

// CancelAppointment cancels a booked registration appointment.
func (c *Client) CancelAppointment(ctx context.Context, aid, authToken string) error {
	resp, err := c.doAuthedRequest(ctx, http.MethodDelete,
		c.cfg.PreRegBaseURL+"/preregistration/v1/appointment/"+aid,
		authToken, nil)
	if err != nil {
		return fmt.Errorf("cancel appointment: %w", err)
	}
	var out struct {
		Errors []MOSIPError `json:"errors"`
	}
	if err := json.Unmarshal(resp, &out); err != nil {
		return fmt.Errorf("cancel appointment decode: %w", err)
	}
	if len(out.Errors) > 0 {
		return fmt.Errorf("mosip error %s: %s", out.Errors[0].ErrorCode, out.Errors[0].Message)
	}
	return nil
}

// ─── Registration Processor ───────────────────────────────────────────────────

// UploadRegistrationPacket uploads an encrypted registration packet to the
// MOSIP Registration Processor for processing and UIN generation.
func (c *Client) UploadRegistrationPacket(ctx context.Context, req PacketData) (string, error) {
	body, _ := json.Marshal(PacketRequest{
		ID:          "mosip.registration.packet",
		Version:     "1.0",
		RequestTime: time.Now().UTC().Format(time.RFC3339),
		Request:     req,
	})
	resp, err := c.doRequest(ctx, http.MethodPost,
		c.cfg.RegProcBaseURL+"/registrationprocessor/v1/registrationstatus/packetreceiver",
		body)
	if err != nil {
		return "", fmt.Errorf("upload packet: %w", err)
	}
	var out struct {
		Response struct {
			RegistrationID string `json:"registrationId"`
			Status         string `json:"status"`
		} `json:"response"`
		Errors []MOSIPError `json:"errors"`
	}
	if err := json.Unmarshal(resp, &out); err != nil {
		return "", fmt.Errorf("upload packet decode: %w", err)
	}
	if len(out.Errors) > 0 {
		return "", fmt.Errorf("mosip error %s: %s", out.Errors[0].ErrorCode, out.Errors[0].Message)
	}
	return out.Response.RegistrationID, nil
}

// GetPacketStatus checks the processing status of a registration packet by RID.
func (c *Client) GetPacketStatus(ctx context.Context, rid string) ([]PacketStatus, error) {
	body, _ := json.Marshal(map[string]interface{}{
		"id":          "mosip.registration.status",
		"version":     "1.0",
		"requesttime": time.Now().UTC().Format(time.RFC3339),
		"request": map[string]interface{}{
			"registrationIds": []string{rid},
		},
	})
	resp, err := c.doRequest(ctx, http.MethodPost,
		c.cfg.RegProcBaseURL+"/registrationprocessor/v1/registrationstatus/search",
		body)
	if err != nil {
		return nil, fmt.Errorf("get packet status: %w", err)
	}
	var out PacketStatusResponse
	if err := json.Unmarshal(resp, &out); err != nil {
		return nil, fmt.Errorf("get packet status decode: %w", err)
	}
	if len(out.Errors) > 0 {
		return nil, fmt.Errorf("mosip error %s: %s", out.Errors[0].ErrorCode, out.Errors[0].Message)
	}
	return out.Response, nil
}

// ─── UIN Lifecycle ────────────────────────────────────────────────────────────

// GetUINIdentity fetches the identity associated with a UIN from the ID repository.
func (c *Client) GetUINIdentity(ctx context.Context, uin, authToken string) (*UINData, error) {
	resp, err := c.doAuthedRequest(ctx, http.MethodGet,
		c.cfg.IDRepoBaseURL+"/idrepository/v1/identity/uin/"+uin,
		authToken, nil)
	if err != nil {
		return nil, fmt.Errorf("get uin identity: %w", err)
	}
	var out UINResponse
	if err := json.Unmarshal(resp, &out); err != nil {
		return nil, fmt.Errorf("get uin identity decode: %w", err)
	}
	if len(out.Errors) > 0 {
		return nil, fmt.Errorf("mosip error %s: %s", out.Errors[0].ErrorCode, out.Errors[0].Message)
	}
	return out.Response, nil
}

// UpdateUINIdentity updates the demographic or biometric data for a UIN.
func (c *Client) UpdateUINIdentity(ctx context.Context, uin string, data UINIdentityData, authToken string) error {
	body, _ := json.Marshal(UINIdentityRequest{
		ID:          "mosip.id.update",
		Version:     "1.0",
		RequestTime: time.Now().UTC().Format(time.RFC3339),
		Request:     data,
	})
	resp, err := c.doAuthedRequest(ctx, http.MethodPut,
		c.cfg.IDRepoBaseURL+"/idrepository/v1/identity",
		authToken, body)
	if err != nil {
		return fmt.Errorf("update uin identity: %w", err)
	}
	var out UINResponse
	if err := json.Unmarshal(resp, &out); err != nil {
		return fmt.Errorf("update uin identity decode: %w", err)
	}
	if len(out.Errors) > 0 {
		return fmt.Errorf("mosip error %s: %s", out.Errors[0].ErrorCode, out.Errors[0].Message)
	}
	return nil
}

// LockUIN locks specific authentication types for a UIN to prevent misuse.
func (c *Client) LockUIN(ctx context.Context, uinHash, saltValue, authType, authToken string) error {
	return c.setUINLock(ctx, uinHash, saltValue, authType, "LOCK", authToken)
}

// UnlockUIN unlocks specific authentication types for a UIN.
func (c *Client) UnlockUIN(ctx context.Context, uinHash, saltValue, authType, authToken string) error {
	return c.setUINLock(ctx, uinHash, saltValue, authType, "UNLOCK", authToken)
}

func (c *Client) setUINLock(ctx context.Context, uinHash, saltValue, authType, requestType, authToken string) error {
	body, _ := json.Marshal(UINLockRequest{
		ID:          "mosip.identity.lock",
		Version:     "1.0",
		RequestTime: time.Now().UTC().Format(time.RFC3339),
		Request: UINLockData{
			HashAttributes: []HashAttribute{
				{HashValue: uinHash, SaltValue: saltValue, AuthType: authType, RequestType: requestType},
			},
		},
	})
	resp, err := c.doAuthedRequest(ctx, http.MethodPatch,
		c.cfg.IDRepoBaseURL+"/idrepository/v1/identity/uin/"+uinHash,
		authToken, body)
	if err != nil {
		return fmt.Errorf("uin lock/unlock: %w", err)
	}
	var out struct {
		Errors []MOSIPError `json:"errors"`
	}
	if err := json.Unmarshal(resp, &out); err != nil {
		return fmt.Errorf("uin lock/unlock decode: %w", err)
	}
	if len(out.Errors) > 0 {
		return fmt.Errorf("mosip error %s: %s", out.Errors[0].ErrorCode, out.Errors[0].Message)
	}
	return nil
}

// GenerateVID generates a Virtual ID (VID) for a UIN, providing a privacy-preserving alias.
func (c *Client) GenerateVID(ctx context.Context, uin, vidType, authToken string) (*VIDResult, error) {
	body, _ := json.Marshal(VIDRequest{
		ID:          "mosip.vid.create",
		Version:     "1.0",
		RequestTime: time.Now().UTC().Format(time.RFC3339),
		Request:     VIDData{UIN: uin, VIDType: vidType},
	})
	resp, err := c.doAuthedRequest(ctx, http.MethodPost,
		c.cfg.IDRepoBaseURL+"/idrepository/v1/vid",
		authToken, body)
	if err != nil {
		return nil, fmt.Errorf("generate vid: %w", err)
	}
	var out VIDResponse
	if err := json.Unmarshal(resp, &out); err != nil {
		return nil, fmt.Errorf("generate vid decode: %w", err)
	}
	if len(out.Errors) > 0 {
		return nil, fmt.Errorf("mosip error %s: %s", out.Errors[0].ErrorCode, out.Errors[0].Message)
	}
	return out.Response, nil
}

// ─── Credential Service ───────────────────────────────────────────────────────

// RequestCredentialIssuance requests the generation of a national ID credential
// (PDF card, QR code, or Verifiable Credential) for a given UIN or VID.
func (c *Client) RequestCredentialIssuance(ctx context.Context, req CredentialIssueData, authToken string) (string, error) {
	body, _ := json.Marshal(CredentialIssuanceRequest{
		ID:          "mosip.credential.request.generator",
		Version:     "1.0",
		RequestTime: time.Now().UTC().Format(time.RFC3339),
		Request:     req,
	})
	resp, err := c.doAuthedRequest(ctx, http.MethodPost,
		c.cfg.CredentialBaseURL+"/credentialservice/v1/credentials/requestgenerator",
		authToken, body)
	if err != nil {
		return "", fmt.Errorf("request credential: %w", err)
	}
	var out struct {
		Response struct {
			RequestID string `json:"requestId"`
		} `json:"response"`
		Errors []MOSIPError `json:"errors"`
	}
	if err := json.Unmarshal(resp, &out); err != nil {
		return "", fmt.Errorf("request credential decode: %w", err)
	}
	if len(out.Errors) > 0 {
		return "", fmt.Errorf("mosip error %s: %s", out.Errors[0].ErrorCode, out.Errors[0].Message)
	}
	return out.Response.RequestID, nil
}

// GetCredentialStatus checks the status of a credential generation request.
func (c *Client) GetCredentialStatus(ctx context.Context, requestID, authToken string) (*CredentialStatus, error) {
	resp, err := c.doAuthedRequest(ctx, http.MethodGet,
		c.cfg.CredentialBaseURL+"/credentialservice/v1/credentials/"+requestID+"/status",
		authToken, nil)
	if err != nil {
		return nil, fmt.Errorf("get credential status: %w", err)
	}
	var out CredentialStatusResponse
	if err := json.Unmarshal(resp, &out); err != nil {
		return nil, fmt.Errorf("get credential status decode: %w", err)
	}
	if len(out.Errors) > 0 {
		return nil, fmt.Errorf("mosip error %s: %s", out.Errors[0].ErrorCode, out.Errors[0].Message)
	}
	return out.Response, nil
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

// doAuthedRequest performs an HTTP request with a Bearer token.
func (c *Client) doAuthedRequest(ctx context.Context, method, url, token string, body []byte) ([]byte, error) {
	var reqBody io.Reader
	if body != nil {
		reqBody = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, url, reqBody)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

// doRequest performs an HTTP request without authentication (for internal services).
func (c *Client) doRequest(ctx context.Context, method, url string, body []byte) ([]byte, error) {
	var reqBody io.Reader
	if body != nil {
		reqBody = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, url, reqBody)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}
