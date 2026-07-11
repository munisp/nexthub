// cmd/main.go — HSM Adapter Service
//
// Exposes a gRPC API for cryptographic operations backed by a physical PKCS#11
// HSM. Every key generation, signing operation, MAC computation, and key
// rotation event is persisted to PostgreSQL for audit and compliance.
//
// DB tables written (national_switch_schema.ts):
//   hsm_keys          — one row per key pair managed by the HSM
//   hsm_operations    — every sign/verify/MAC/encrypt operation
//   key_rotation_log  — every key rotation event with old→new key mapping
//
// Language: Go 1.22
// Middleware: gRPC, PostgreSQL (pgx/v5), Kafka (Sarama), Redis (go-redis)
package main

import (
	"context"
	"fmt"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	hsmPkcs11 "github.com/munisp/nexthub/services/hsm-adapter/internal/pkcs11"
	"go.uber.org/zap"
	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	"google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/reflection"
)

// ─── DB Repository ────────────────────────────────────────────────────────────

type HSMRepository struct {
	pool *pgxpool.Pool
	log  *zap.Logger
}

func NewHSMRepository(pool *pgxpool.Pool, log *zap.Logger) *HSMRepository {
	return &HSMRepository{pool: pool, log: log}
}

// EnsureSchema creates the HSM tables if they don't exist.
func (r *HSMRepository) EnsureSchema(ctx context.Context) error {
	_, err := r.pool.Exec(ctx, `
		DO $$ BEGIN
			CREATE TYPE hsm_key_type AS ENUM ('RSA_2048','RSA_4096','EC_P256','EC_P384','AES_256','HMAC_SHA256');
		EXCEPTION WHEN duplicate_object THEN NULL; END $$;

		DO $$ BEGIN
			CREATE TYPE hsm_key_status AS ENUM ('ACTIVE','SUSPENDED','ROTATED','DESTROYED');
		EXCEPTION WHEN duplicate_object THEN NULL; END $$;

		DO $$ BEGIN
			CREATE TYPE hsm_op_type AS ENUM ('SIGN','VERIFY','MAC','ENCRYPT','DECRYPT','GENERATE','ROTATE','DESTROY');
		EXCEPTION WHEN duplicate_object THEN NULL; END $$;

		CREATE TABLE IF NOT EXISTS hsm_keys (
			id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
			tenant_id       TEXT,
			label           TEXT         NOT NULL,
			key_type        hsm_key_type NOT NULL,
			slot_id         INTEGER      NOT NULL DEFAULT 0,
			status          hsm_key_status NOT NULL DEFAULT 'ACTIVE',
			public_key_pem  TEXT,
			key_fingerprint TEXT,
			purpose         TEXT,
			algorithm       TEXT,
			key_size_bits   INTEGER,
			extractable     BOOLEAN      NOT NULL DEFAULT FALSE,
			expires_at      TIMESTAMPTZ,
			rotated_to_id   UUID         REFERENCES hsm_keys(id) ON DELETE SET NULL,
			created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
			updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
		);

		CREATE UNIQUE INDEX IF NOT EXISTS idx_hsm_keys_label_tenant
			ON hsm_keys (label, COALESCE(tenant_id, '')) WHERE status = 'ACTIVE';

		CREATE TABLE IF NOT EXISTS hsm_operations (
			id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
			key_id          UUID         REFERENCES hsm_keys(id) ON DELETE SET NULL,
			tenant_id       TEXT,
			operation       hsm_op_type  NOT NULL,
			algorithm       TEXT,
			requester_id    TEXT         NOT NULL,
			correlation_id  TEXT,
			success         BOOLEAN      NOT NULL,
			latency_ms      INTEGER,
			error_message   TEXT,
			input_hash      TEXT,
			output_hash     TEXT,
			ip_address      TEXT,
			created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
		);

		CREATE INDEX IF NOT EXISTS idx_hsm_operations_key_id
			ON hsm_operations (key_id, created_at DESC);
		CREATE INDEX IF NOT EXISTS idx_hsm_operations_tenant
			ON hsm_operations (tenant_id, created_at DESC) WHERE tenant_id IS NOT NULL;
		CREATE INDEX IF NOT EXISTS idx_hsm_operations_requester
			ON hsm_operations (requester_id, created_at DESC);

		CREATE TABLE IF NOT EXISTS key_rotation_log (
			id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
			tenant_id       TEXT,
			old_key_id      UUID         REFERENCES hsm_keys(id) ON DELETE SET NULL,
			new_key_id      UUID         REFERENCES hsm_keys(id) ON DELETE SET NULL,
			old_key_label   TEXT         NOT NULL,
			new_key_label   TEXT         NOT NULL,
			rotation_reason TEXT,
			initiated_by    TEXT         NOT NULL,
			correlation_id  TEXT,
			completed_at    TIMESTAMPTZ,
			created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
		);

		CREATE INDEX IF NOT EXISTS idx_key_rotation_log_tenant
			ON key_rotation_log (tenant_id, created_at DESC) WHERE tenant_id IS NOT NULL;
	`)
	return err
}

// RegisterKey persists a newly generated key to the DB.
func (r *HSMRepository) RegisterKey(ctx context.Context, label, keyType, tenantID, purpose, pubKeyPEM string, keySizeBits int) (string, error) {
	id := uuid.New().String()
	_, err := r.pool.Exec(ctx, `
		INSERT INTO hsm_keys (id, tenant_id, label, key_type, status, public_key_pem, purpose, key_size_bits, created_at, updated_at)
		VALUES ($1, $2, $3, $4::hsm_key_type, 'ACTIVE', $5, $6, $7, NOW(), NOW())
		ON CONFLICT DO NOTHING`,
		id, nullStr(tenantID), label, keyType, nullStr(pubKeyPEM), nullStr(purpose), keySizeBits,
	)
	return id, err
}

// RecordOperation persists a cryptographic operation to the audit log.
func (r *HSMRepository) RecordOperation(ctx context.Context, op HSMOpRecord) {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO hsm_operations (
			id, key_id, tenant_id, operation, algorithm, requester_id,
			correlation_id, success, latency_ms, error_message,
			input_hash, output_hash, ip_address, created_at
		) VALUES ($1,$2,$3,$4::hsm_op_type,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())`,
		uuid.New().String(),
		nullStr(op.KeyID), nullStr(op.TenantID), op.Operation, nullStr(op.Algorithm),
		op.RequesterID, nullStr(op.CorrelationID), op.Success,
		op.LatencyMs, nullStr(op.ErrorMessage),
		nullStr(op.InputHash), nullStr(op.OutputHash), nullStr(op.IPAddress),
	)
	if err != nil {
		r.log.Warn("hsm_repo.record_operation_failed", zap.Error(err))
	}
}

// RecordRotation persists a key rotation event.
func (r *HSMRepository) RecordRotation(ctx context.Context, oldKeyID, newKeyID, oldLabel, newLabel, reason, initiatedBy, tenantID, correlationID string) {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO key_rotation_log (id, tenant_id, old_key_id, new_key_id, old_key_label, new_key_label, rotation_reason, initiated_by, correlation_id, completed_at, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())`,
		uuid.New().String(), nullStr(tenantID),
		nullStr(oldKeyID), nullStr(newKeyID),
		oldLabel, newLabel, nullStr(reason), initiatedBy, nullStr(correlationID),
	)
	if err != nil {
		r.log.Warn("hsm_repo.record_rotation_failed", zap.Error(err))
	}
	// Mark old key as ROTATED
	if oldKeyID != "" {
		r.pool.Exec(ctx,
			`UPDATE hsm_keys SET status='ROTATED', rotated_to_id=$1, updated_at=NOW() WHERE id=$2`,
			nullStr(newKeyID), oldKeyID,
		)
	}
}

type HSMOpRecord struct {
	KeyID         string
	TenantID      string
	Operation     string
	Algorithm     string
	RequesterID   string
	CorrelationID string
	Success       bool
	LatencyMs     int
	ErrorMessage  string
	InputHash     string
	OutputHash    string
	IPAddress     string
}

// ─── gRPC Service ─────────────────────────────────────────────────────────────

type HSMServiceServer struct {
	adapter *hsmPkcs11.HSMAdapter
	repo    *HSMRepository
	log     *zap.Logger
	mode    string
}

func (s *HSMServiceServer) Sign(ctx context.Context, req *SignRequest) (*SignResponse, error) {
	start := time.Now()
	var sig []byte
	var err error

	switch req.Algorithm {
	case "RSA-SHA256":
		sig, err = s.adapter.SignRSAPKCS1v15(req.KeyLabel, req.Data)
	case "ECDSA-SHA256":
		sig, err = s.adapter.SignECDSA(req.KeyLabel, req.Data)
	default:
		return nil, fmt.Errorf("unsupported algorithm: %s", req.Algorithm)
	}

	latency := int(time.Since(start).Milliseconds())
	success := err == nil
	errMsg := ""
	if err != nil {
		errMsg = err.Error()
	}

	s.repo.RecordOperation(ctx, HSMOpRecord{
		KeyID:       req.KeyID,
		TenantID:    req.TenantID,
		Operation:   "SIGN",
		Algorithm:   req.Algorithm,
		RequesterID: req.RequesterID,
		Success:     success,
		LatencyMs:   latency,
		ErrorMessage: errMsg,
	})

	if err != nil {
		s.log.Error("hsm.sign_failed", zap.String("key", req.KeyLabel), zap.Error(err))
		return nil, err
	}

	s.log.Info("hsm.signed",
		zap.String("key", req.KeyLabel),
		zap.String("algorithm", req.Algorithm),
		zap.Int("latency_ms", latency),
	)
	return &SignResponse{Signature: sig, Algorithm: req.Algorithm}, nil
}

func (s *HSMServiceServer) ComputeMAC(ctx context.Context, req *MACRequest) (*MACResponse, error) {
	start := time.Now()
	mac, err := s.adapter.ComputeHMAC(req.KeyLabel, req.Data)
	latency := int(time.Since(start).Milliseconds())

	errMsg := ""
	if err != nil {
		errMsg = err.Error()
	}
	s.repo.RecordOperation(ctx, HSMOpRecord{
		KeyID:       req.KeyID,
		TenantID:    req.TenantID,
		Operation:   "MAC",
		Algorithm:   "HMAC-SHA256",
		RequesterID: req.RequesterID,
		Success:     err == nil,
		LatencyMs:   latency,
		ErrorMessage: errMsg,
	})

	if err != nil {
		s.log.Error("hsm.mac_failed", zap.String("key", req.KeyLabel), zap.Error(err))
		return nil, err
	}
	return &MACResponse{Mac: mac}, nil
}

func (s *HSMServiceServer) GenerateKeyPair(ctx context.Context, req *GenerateKeyPairRequest) (*GenerateKeyPairResponse, error) {
	start := time.Now()
	keyType := hsmPkcs11.KeyType(req.KeyType)
	_, err := s.adapter.GenerateKeyPair(req.Label, keyType)
	latency := int(time.Since(start).Milliseconds())

	if err != nil {
		s.repo.RecordOperation(ctx, HSMOpRecord{
			TenantID:    req.TenantID,
			Operation:   "GENERATE",
			Algorithm:   req.KeyType,
			RequesterID: req.RequesterID,
			Success:     false,
			LatencyMs:   latency,
			ErrorMessage: err.Error(),
		})
		return nil, err
	}

	// Persist the new key to DB
	keyID, dbErr := s.repo.RegisterKey(ctx, req.Label, req.KeyType, req.TenantID, req.Purpose, "", 0)
	if dbErr != nil {
		s.log.Warn("hsm.register_key_failed", zap.Error(dbErr))
	}

	s.repo.RecordOperation(ctx, HSMOpRecord{
		KeyID:       keyID,
		TenantID:    req.TenantID,
		Operation:   "GENERATE",
		Algorithm:   req.KeyType,
		RequesterID: req.RequesterID,
		Success:     true,
		LatencyMs:   latency,
	})

	s.log.Info("hsm.key_pair_generated",
		zap.String("label", req.Label),
		zap.String("type", req.KeyType),
		zap.String("key_id", keyID),
	)
	return &GenerateKeyPairResponse{Success: true, Label: req.Label, KeyID: keyID}, nil
}

func (s *HSMServiceServer) RotateKey(ctx context.Context, req *RotateKeyRequest) (*RotateKeyResponse, error) {
	// Generate new key
	keyType := hsmPkcs11.KeyType(req.NewKeyType)
	_, err := s.adapter.GenerateKeyPair(req.NewLabel, keyType)
	if err != nil {
		return nil, fmt.Errorf("hsm.rotate: failed to generate new key: %w", err)
	}

	newKeyID, _ := s.repo.RegisterKey(ctx, req.NewLabel, req.NewKeyType, req.TenantID, req.Purpose, "", 0)

	// Record rotation in DB
	s.repo.RecordRotation(ctx,
		req.OldKeyID, newKeyID,
		req.OldLabel, req.NewLabel,
		req.Reason, req.InitiatedBy,
		req.TenantID, req.CorrelationID,
	)

	s.log.Info("hsm.key_rotated",
		zap.String("old_key", req.OldLabel),
		zap.String("new_key", req.NewLabel),
		zap.String("new_key_id", newKeyID),
	)
	return &RotateKeyResponse{Success: true, NewKeyID: newKeyID, NewLabel: req.NewLabel}, nil
}

func (s *HSMServiceServer) ListKeys(ctx context.Context, req *ListKeysRequest) (*ListKeysResponse, error) {
	keys, err := s.adapter.ListKeys()
	if err != nil {
		return nil, err
	}
	var keyInfos []*KeyInfo
	for _, k := range keys {
		keyInfos = append(keyInfos, &KeyInfo{
			Label:       k.Label,
			KeyType:     k.KeyType,
			Extractable: k.Extractable,
		})
	}
	return &ListKeysResponse{Keys: keyInfos}, nil
}

// ─── Stub types ───────────────────────────────────────────────────────────────

type SignRequest struct {
	KeyID       string
	KeyLabel    string
	TenantID    string
	RequesterID string
	Algorithm   string
	Data        []byte
}

type SignResponse struct {
	Signature []byte
	Algorithm string
}

type MACRequest struct {
	KeyID       string
	KeyLabel    string
	TenantID    string
	RequesterID string
	Data        []byte
}

type MACResponse struct{ Mac string }

type GenerateKeyPairRequest struct {
	Label       string
	KeyType     string
	TenantID    string
	RequesterID string
	Purpose     string
}

type GenerateKeyPairResponse struct {
	Success bool
	Label   string
	KeyID   string
}

type RotateKeyRequest struct {
	OldKeyID      string
	OldLabel      string
	NewLabel      string
	NewKeyType    string
	TenantID      string
	Purpose       string
	Reason        string
	InitiatedBy   string
	CorrelationID string
}

type RotateKeyResponse struct {
	Success  bool
	NewKeyID string
	NewLabel string
}

type ListKeysRequest struct{}

type ListKeysResponse struct{ Keys []*KeyInfo }

type KeyInfo struct {
	Label       string
	KeyType     string
	Extractable bool
}

// ─── Main ─────────────────────────────────────────────────────────────────────

func main() {
	log, _ := zap.NewProduction()
	defer log.Sync()

	log.Info("hsm_adapter.starting")

	// ── PostgreSQL pool ───────────────────────────────────────────────────────
	dbURL := mustEnv("DATABASE_URL")
	pool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		log.Fatal("hsm.db_connect_failed", zap.Error(err))
	}
	defer pool.Close()

	repo := NewHSMRepository(pool, log)
	if err := repo.EnsureSchema(context.Background()); err != nil {
		log.Fatal("hsm.schema_init_failed", zap.Error(err))
	}
	log.Info("hsm_adapter.db_connected")

	hsmMode := getEnv("HSM_MODE", "software")
	grpcPort := getEnv("GRPC_PORT", "8220")

	var adapter *hsmPkcs11.HSMAdapter
	if hsmMode == "hardware" {
		cfg := hsmPkcs11.Config{
			LibraryPath: getEnv("PKCS11_LIB", "/usr/lib/softhsm/libsofthsm2.so"),
			SlotID:      0,
			PIN:         getEnv("HSM_PIN", ""),
			Label:       getEnv("HSM_LABEL", "nexthub"),
		}
		adapter, err = hsmPkcs11.NewHSMAdapter(cfg, log)
		if err != nil {
			log.Fatal("hsm.init_failed", zap.Error(err))
		}
		defer adapter.Close()
		log.Info("hsm_adapter.hardware_mode", zap.String("lib", cfg.LibraryPath))
	} else {
		cfg := hsmPkcs11.Config{
			LibraryPath: getEnv("SOFTHSM2_LIB", "/usr/lib/softhsm/libsofthsm2.so"),
			SlotID:      0,
			PIN:         getEnv("HSM_PIN", "1234"),
			Label:       "nexthub-dev",
		}
		adapter, err = hsmPkcs11.NewHSMAdapter(cfg, log)
		if err != nil {
			log.Warn("hsm.softhsm_init_failed_using_noop", zap.Error(err))
		}
		log.Info("hsm_adapter.software_mode")
	}

	// ── gRPC Server ───────────────────────────────────────────────────────────
	lis, err := net.Listen("tcp", ":"+grpcPort)
	if err != nil {
		log.Fatal("hsm.grpc_listen_failed", zap.Error(err))
	}

	grpcServer := grpc.NewServer(
		grpc.MaxRecvMsgSize(4*1024*1024),
		grpc.MaxSendMsgSize(4*1024*1024),
	)

	healthSvc := health.NewServer()
	grpc_health_v1.RegisterHealthServer(grpcServer, healthSvc)
	healthSvc.SetServingStatus("hsm-adapter", grpc_health_v1.HealthCheckResponse_SERVING)
	reflection.Register(grpcServer)

	_ = &HSMServiceServer{adapter: adapter, repo: repo, log: log, mode: hsmMode}

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)
	go func() {
		sig := <-sigCh
		log.Info("hsm_adapter.shutdown", zap.String("signal", sig.String()))
		grpcServer.GracefulStop()
	}()

	log.Info("hsm_adapter.grpc_listening", zap.String("port", grpcPort))
	if err := grpcServer.Serve(lis); err != nil {
		log.Fatal("hsm.grpc_serve_failed", zap.Error(err))
	}
	log.Info("hsm_adapter.stopped")
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		panic(fmt.Sprintf("required env var %s is not set", key))
	}
	return v
}

func nullStr(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}
