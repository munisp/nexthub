// Package pkcs11 implements the PKCS#11 interface for physical HSM devices.
// It supports:
//   - Thales Luna Network HSM (most common in Nigerian banks)
//   - Utimaco SecurityServer
//   - AWS CloudHSM (PKCS#11 library)
//   - SoftHSM2 (for development/testing)
//
// All cryptographic operations (sign, verify, MAC, encrypt, decrypt) are
// delegated to the HSM. Private keys never leave the HSM boundary.
//
// Language: Go 1.22 (miekg/pkcs11)
package pkcs11

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sync"

	"github.com/miekg/pkcs11"
	"go.uber.org/zap"
)

// ─── Config ───────────────────────────────────────────────────────────────────

type Config struct {
	LibraryPath string // Path to PKCS#11 shared library (.so)
	SlotID      uint   // HSM slot number
	PIN         string // HSM operator PIN
	Label       string // Token label for key lookup
}

// ─── KeyType ──────────────────────────────────────────────────────────────────

type KeyType string

const (
	KeyTypeRSA2048    KeyType = "RSA-2048"
	KeyTypeRSA4096    KeyType = "RSA-4096"
	KeyTypeECCP256    KeyType = "EC-P256"
	KeyTypeECCP384    KeyType = "EC-P384"
	KeyTypeAES256     KeyType = "AES-256"
	KeyTypeHMACSHA256 KeyType = "HMAC-SHA256"
)

// ─── HSMAdapter ───────────────────────────────────────────────────────────────

type HSMAdapter struct {
	ctx     *pkcs11.Ctx
	session pkcs11.SessionHandle
	mu      sync.Mutex
	log     *zap.Logger
	cfg     Config
}

// NewHSMAdapter initialises the PKCS#11 library and opens a session.
func NewHSMAdapter(cfg Config, log *zap.Logger) (*HSMAdapter, error) {
	ctx := pkcs11.New(cfg.LibraryPath)
	if ctx == nil {
		return nil, fmt.Errorf("pkcs11: failed to load library %s", cfg.LibraryPath)
	}

	if err := ctx.Initialize(); err != nil {
		return nil, fmt.Errorf("pkcs11: initialize: %w", err)
	}

	// Open a read-write session on the specified slot
	session, err := ctx.OpenSession(cfg.SlotID, pkcs11.CKF_SERIAL_SESSION|pkcs11.CKF_RW_SESSION)
	if err != nil {
		ctx.Finalize()
		ctx.Destroy()
		return nil, fmt.Errorf("pkcs11: open session slot=%d: %w", cfg.SlotID, err)
	}

	// Login with operator PIN
	if err := ctx.Login(session, pkcs11.CKU_USER, cfg.PIN); err != nil {
		ctx.CloseSession(session)
		ctx.Finalize()
		ctx.Destroy()
		return nil, fmt.Errorf("pkcs11: login: %w", err)
	}

	log.Info("hsm.session_opened",
		zap.String("library", cfg.LibraryPath),
		zap.Uint("slot", cfg.SlotID),
		zap.String("label", cfg.Label),
	)

	return &HSMAdapter{ctx: ctx, session: session, log: log, cfg: cfg}, nil
}

// Close logs out and closes the HSM session.
func (h *HSMAdapter) Close() {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.ctx.Logout(h.session)
	h.ctx.CloseSession(h.session)
	h.ctx.Finalize()
	h.ctx.Destroy()
	h.log.Info("hsm.session_closed")
}

// ─── Key Management ───────────────────────────────────────────────────────────

// GenerateKeyPair generates an RSA or EC key pair inside the HSM.
// The private key never leaves the HSM; only the public key is returned.
func (h *HSMAdapter) GenerateKeyPair(label string, keyType KeyType) (pubKeyHandle pkcs11.ObjectHandle, err error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	var mechanism []*pkcs11.Mechanism
	var pubTemplate, privTemplate []*pkcs11.Attribute

	switch keyType {
	case KeyTypeRSA2048, KeyTypeRSA4096:
		bits := uint(2048)
		if keyType == KeyTypeRSA4096 {
			bits = 4096
		}
		mechanism = []*pkcs11.Mechanism{pkcs11.NewMechanism(pkcs11.CKM_RSA_PKCS_KEY_PAIR_GEN, nil)}
		pubTemplate = []*pkcs11.Attribute{
			pkcs11.NewAttribute(pkcs11.CKA_CLASS, pkcs11.CKO_PUBLIC_KEY),
			pkcs11.NewAttribute(pkcs11.CKA_KEY_TYPE, pkcs11.CKK_RSA),
			pkcs11.NewAttribute(pkcs11.CKA_TOKEN, true),
			pkcs11.NewAttribute(pkcs11.CKA_VERIFY, true),
			pkcs11.NewAttribute(pkcs11.CKA_ENCRYPT, true),
			pkcs11.NewAttribute(pkcs11.CKA_MODULUS_BITS, bits),
			pkcs11.NewAttribute(pkcs11.CKA_PUBLIC_EXPONENT, []byte{1, 0, 1}),
			pkcs11.NewAttribute(pkcs11.CKA_LABEL, label+"-pub"),
		}
		privTemplate = []*pkcs11.Attribute{
			pkcs11.NewAttribute(pkcs11.CKA_CLASS, pkcs11.CKO_PRIVATE_KEY),
			pkcs11.NewAttribute(pkcs11.CKA_KEY_TYPE, pkcs11.CKK_RSA),
			pkcs11.NewAttribute(pkcs11.CKA_TOKEN, true),
			pkcs11.NewAttribute(pkcs11.CKA_SIGN, true),
			pkcs11.NewAttribute(pkcs11.CKA_DECRYPT, true),
			pkcs11.NewAttribute(pkcs11.CKA_SENSITIVE, true),
			pkcs11.NewAttribute(pkcs11.CKA_EXTRACTABLE, false), // Key never leaves HSM
			pkcs11.NewAttribute(pkcs11.CKA_LABEL, label+"-priv"),
		}

	case KeyTypeECCP256, KeyTypeECCP384:
		// EC P-256 OID: 1.2.840.10045.3.1.7
		// EC P-384 OID: 1.3.132.0.34
		oid := []byte{0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07} // P-256
		if keyType == KeyTypeECCP384 {
			oid = []byte{0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x22} // P-384
		}
		mechanism = []*pkcs11.Mechanism{pkcs11.NewMechanism(pkcs11.CKM_EC_KEY_PAIR_GEN, nil)}
		pubTemplate = []*pkcs11.Attribute{
			pkcs11.NewAttribute(pkcs11.CKA_CLASS, pkcs11.CKO_PUBLIC_KEY),
			pkcs11.NewAttribute(pkcs11.CKA_KEY_TYPE, pkcs11.CKK_EC),
			pkcs11.NewAttribute(pkcs11.CKA_TOKEN, true),
			pkcs11.NewAttribute(pkcs11.CKA_VERIFY, true),
			pkcs11.NewAttribute(pkcs11.CKA_EC_PARAMS, oid),
			pkcs11.NewAttribute(pkcs11.CKA_LABEL, label+"-pub"),
		}
		privTemplate = []*pkcs11.Attribute{
			pkcs11.NewAttribute(pkcs11.CKA_CLASS, pkcs11.CKO_PRIVATE_KEY),
			pkcs11.NewAttribute(pkcs11.CKA_KEY_TYPE, pkcs11.CKK_EC),
			pkcs11.NewAttribute(pkcs11.CKA_TOKEN, true),
			pkcs11.NewAttribute(pkcs11.CKA_SIGN, true),
			pkcs11.NewAttribute(pkcs11.CKA_SENSITIVE, true),
			pkcs11.NewAttribute(pkcs11.CKA_EXTRACTABLE, false),
			pkcs11.NewAttribute(pkcs11.CKA_LABEL, label+"-priv"),
		}

	default:
		return 0, fmt.Errorf("pkcs11: unsupported key type %s", keyType)
	}

	pub, _, err := h.ctx.GenerateKeyPair(h.session, mechanism, pubTemplate, privTemplate)
	if err != nil {
		return 0, fmt.Errorf("pkcs11: generate key pair label=%s type=%s: %w", label, keyType, err)
	}

	h.log.Info("hsm.key_pair_generated",
		zap.String("label", label),
		zap.String("key_type", string(keyType)),
	)

	return pub, nil
}

// ─── Sign ─────────────────────────────────────────────────────────────────────

// SignRSAPKCS1v15 signs a SHA-256 digest using the HSM private key identified by label.
func (h *HSMAdapter) SignRSAPKCS1v15(label string, data []byte) ([]byte, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	privKey, err := h.findPrivateKey(label)
	if err != nil {
		return nil, err
	}

	digest := sha256.Sum256(data)

	if err := h.ctx.SignInit(h.session,
		[]*pkcs11.Mechanism{pkcs11.NewMechanism(pkcs11.CKM_SHA256_RSA_PKCS, nil)},
		privKey,
	); err != nil {
		return nil, fmt.Errorf("pkcs11: sign init: %w", err)
	}

	sig, err := h.ctx.Sign(h.session, digest[:])
	if err != nil {
		return nil, fmt.Errorf("pkcs11: sign: %w", err)
	}

	return sig, nil
}

// SignECDSA signs data using an EC private key in the HSM.
func (h *HSMAdapter) SignECDSA(label string, data []byte) ([]byte, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	privKey, err := h.findPrivateKey(label)
	if err != nil {
		return nil, err
	}

	digest := sha256.Sum256(data)

	if err := h.ctx.SignInit(h.session,
		[]*pkcs11.Mechanism{pkcs11.NewMechanism(pkcs11.CKM_ECDSA, nil)},
		privKey,
	); err != nil {
		return nil, fmt.Errorf("pkcs11: ecdsa sign init: %w", err)
	}

	sig, err := h.ctx.Sign(h.session, digest[:])
	if err != nil {
		return nil, fmt.Errorf("pkcs11: ecdsa sign: %w", err)
	}

	return sig, nil
}

// ─── MAC (HMAC-SHA256) ────────────────────────────────────────────────────────

// ComputeHMAC computes an HMAC-SHA256 MAC using a symmetric key in the HSM.
// Used for JWS MAC operations in the NIP gateway.
func (h *HSMAdapter) ComputeHMAC(keyLabel string, data []byte) (string, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	key, err := h.findSecretKey(keyLabel)
	if err != nil {
		return "", err
	}

	if err := h.ctx.SignInit(h.session,
		[]*pkcs11.Mechanism{pkcs11.NewMechanism(pkcs11.CKM_SHA256_HMAC, nil)},
		key,
	); err != nil {
		return "", fmt.Errorf("pkcs11: hmac init: %w", err)
	}

	mac, err := h.ctx.Sign(h.session, data)
	if err != nil {
		return "", fmt.Errorf("pkcs11: hmac sign: %w", err)
	}

	return hex.EncodeToString(mac), nil
}

// ─── Key Status ───────────────────────────────────────────────────────────────

type KeyInfo struct {
	Label       string
	KeyType     string
	TokenObject bool
	Extractable bool
	Handle      pkcs11.ObjectHandle
}

// ListKeys returns all key objects in the current HSM session.
func (h *HSMAdapter) ListKeys() ([]KeyInfo, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	template := []*pkcs11.Attribute{
		pkcs11.NewAttribute(pkcs11.CKA_TOKEN, true),
	}

	if err := h.ctx.FindObjectsInit(h.session, template); err != nil {
		return nil, fmt.Errorf("pkcs11: find objects init: %w", err)
	}
	defer h.ctx.FindObjectsFinal(h.session)

	handles, _, err := h.ctx.FindObjects(h.session, 100)
	if err != nil {
		return nil, fmt.Errorf("pkcs11: find objects: %w", err)
	}

	var keys []KeyInfo
	for _, handle := range handles {
		attrs, err := h.ctx.GetAttributeValue(h.session, handle, []*pkcs11.Attribute{
			pkcs11.NewAttribute(pkcs11.CKA_LABEL, nil),
			pkcs11.NewAttribute(pkcs11.CKA_KEY_TYPE, nil),
			pkcs11.NewAttribute(pkcs11.CKA_EXTRACTABLE, nil),
		})
		if err != nil {
			continue
		}
		label := ""
		keyTypeVal := ""
		extractable := false
		for _, a := range attrs {
			switch a.Type {
			case pkcs11.CKA_LABEL:
				label = string(a.Value)
			case pkcs11.CKA_KEY_TYPE:
				if len(a.Value) > 0 {
					keyTypeVal = fmt.Sprintf("0x%x", a.Value[0])
				}
			case pkcs11.CKA_EXTRACTABLE:
				extractable = len(a.Value) > 0 && a.Value[0] == 1
			}
		}
		keys = append(keys, KeyInfo{
			Label:       label,
			KeyType:     keyTypeVal,
			TokenObject: true,
			Extractable: extractable,
			Handle:      handle,
		})
	}

	return keys, nil
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

func (h *HSMAdapter) findPrivateKey(label string) (pkcs11.ObjectHandle, error) {
	template := []*pkcs11.Attribute{
		pkcs11.NewAttribute(pkcs11.CKA_CLASS, pkcs11.CKO_PRIVATE_KEY),
		pkcs11.NewAttribute(pkcs11.CKA_LABEL, label+"-priv"),
	}
	if err := h.ctx.FindObjectsInit(h.session, template); err != nil {
		return 0, fmt.Errorf("pkcs11: find priv key init label=%s: %w", label, err)
	}
	defer h.ctx.FindObjectsFinal(h.session)

	handles, _, err := h.ctx.FindObjects(h.session, 1)
	if err != nil || len(handles) == 0 {
		return 0, fmt.Errorf("pkcs11: private key not found label=%s", label)
	}
	return handles[0], nil
}

func (h *HSMAdapter) findSecretKey(label string) (pkcs11.ObjectHandle, error) {
	template := []*pkcs11.Attribute{
		pkcs11.NewAttribute(pkcs11.CKA_CLASS, pkcs11.CKO_SECRET_KEY),
		pkcs11.NewAttribute(pkcs11.CKA_LABEL, label),
	}
	if err := h.ctx.FindObjectsInit(h.session, template); err != nil {
		return 0, fmt.Errorf("pkcs11: find secret key init label=%s: %w", label, err)
	}
	defer h.ctx.FindObjectsFinal(h.session)

	handles, _, err := h.ctx.FindObjects(h.session, 1)
	if err != nil || len(handles) == 0 {
		return 0, fmt.Errorf("pkcs11: secret key not found label=%s", label)
	}
	return handles[0], nil
}

// SoftwareSignFallback is used when HSM is unavailable (dev/test only).
// It uses Go's software RSA implementation.
func SoftwareSignFallback(privKey *rsa.PrivateKey, data []byte) ([]byte, error) {
	digest := sha256.Sum256(data)
	return rsa.SignPKCS1v15(rand.Reader, privKey, crypto.SHA256, digest[:])
}
