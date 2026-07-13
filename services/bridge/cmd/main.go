// cmd/main.go — NextHub Go middleware bridge entry point.
//
// This service acts as the orchestration backbone for the NextHub payment switch.
// It receives HTTP calls from the TypeScript tRPC server (via middlewareBridge.ts),
// executes Temporal workflows, interacts with the TigerBeetle ledger (via the Rust
// sidecar), publishes Kafka events, enforces Permify RBAC, and validates Keycloak JWTs.
package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"database/sql"
	_ "github.com/lib/pq"
	"github.com/redis/go-redis/v9"
	"github.com/munisp/nexthub/bridge/internal/config"
	"github.com/munisp/nexthub/bridge/internal/handlers"
	"github.com/munisp/nexthub/bridge/internal/kafka"
	"github.com/munisp/nexthub/bridge/internal/keycloak"
	"github.com/munisp/nexthub/bridge/internal/ledger"
	bMiddleware "github.com/munisp/nexthub/bridge/internal/middleware"
	"github.com/munisp/nexthub/bridge/internal/facebiometric"
	"github.com/munisp/nexthub/bridge/internal/mosip"
	"github.com/munisp/nexthub/bridge/internal/permify"
	temporalWorker "github.com/munisp/nexthub/bridge/internal/temporal"
)

func main() {
	// ── Logger ────────────────────────────────────────────────────────────────
	log, _ := zap.NewProduction()
	defer log.Sync()

	// ── Config ────────────────────────────────────────────────────────────────
	cfg := config.Load()
	log.Info("bridge_starting", zap.String("port", cfg.Port))

	// ── Kafka producer ────────────────────────────────────────────────────────
	kafkaProducer := kafka.NewProducer(cfg.KafkaBrokers, log)
	defer kafkaProducer.Close()

	// ── TigerBeetle ledger sidecar ────────────────────────────────────────────
	ledgerClient := ledger.NewClient("http://" + cfg.TigerBeetleAddr)

	// ── Permify client ────────────────────────────────────────────────────────
	permifyClient := permify.NewClient(cfg.PermifyEndpoint, cfg.PermifyToken)

	// ── Temporal worker (non-fatal if Temporal is offline) ────────────────────
	var temporalClient *temporalWorker.Worker
	worker, err := temporalWorker.NewWorker(cfg.TemporalHost, cfg.TemporalNamespace, log)
	if err != nil {
		log.Warn("temporal_unavailable", zap.Error(err))
	} else {
		if err := worker.Start(); err != nil {
			log.Warn("temporal_worker_start_failed", zap.Error(err))
		} else {
			log.Info("temporal_worker_started")
			temporalClient = worker
			defer worker.Stop()
		}
	}

	// ── Keycloak client ──────────────────────────────────────────────────────
	keycloakClient := keycloak.NewClient(
		cfg.KeycloakURL, cfg.KeycloakRealm,
		cfg.KeycloakClientID, cfg.KeycloakSecret,
		cfg.JWTSecret,
	)

	// ── MOSIP / eSignet client ────────────────────────────────────────────────
	mosipCfg := mosip.ConfigFromEnv()
	mosipClient, mosipErr := mosip.New(mosipCfg, log)
	if mosipErr != nil {
		log.Warn("mosip_client_init_failed", zap.Error(mosipErr))
		mosipClient = nil // non-fatal — MOSIP endpoints will return 503
	}
	// ── Face Biometric client ─────────────────────────────────────────────────
	faceBiometricCfg := facebiometric.ConfigFromEnv()
	faceBiometricClient := facebiometric.New(faceBiometricCfg)
	log.Info("face_biometric_client_configured", zap.String("url", faceBiometricCfg.BaseURL))
	// ── PostgreSQL (for partner API key lookups) ──────────────────────────────
	partnerDB, dbErr := sql.Open("postgres", cfg.DatabaseURL)
	if dbErr != nil {
		log.Warn("partner_db_open_failed", zap.Error(dbErr))
		partnerDB = nil
	}
	// ── Redis (for partner key caching + rate limiting) ───────────────────────
	redisOpts, redisErr := redis.ParseURL(cfg.RedisAddr)
	var partnerRedis *redis.Client
	if redisErr != nil {
		log.Warn("partner_redis_parse_failed", zap.Error(redisErr))
	} else {
		partnerRedis = redis.NewClient(redisOpts)
	}

	// ── HTTP handlers ─────────────────────────────────────────────────────────
	h := &handlers.Handler{
		Ledger:        ledgerClient,
		Kafka:         kafkaProducer,
		Permify:       permifyClient,
		Keycloak:      keycloakClient,
		MOSIP:         mosipClient,
		FaceBiometric: faceBiometricClient,
		Log:           log,
	}
	if worker != nil {
		h.Temporal = worker.Client
	}

	// ── Gin router ────────────────────────────────────────────────────────────
	if cfg.LogLevel != "debug" {
		gin.SetMode(gin.ReleaseMode)
	}
	r := gin.New()
	r.Use(bMiddleware.Recovery())
	r.Use(bMiddleware.RequestLogger())

	// Health (no auth)
	r.GET("/health", h.Health)

	// All other routes require the internal key
	v1 := r.Group("/v1", bMiddleware.InternalKeyAuth(cfg.InternalKey))
	{
		// Payout approval
		v1.POST("/payout/initiate",            h.InitiateApproval)
		v1.POST("/payout/:payoutId/approve",   h.ApproveApproval)
		v1.POST("/payout/:payoutId/reject",    h.RejectApproval)

		// Transfers
		v1.POST("/transfer/initiate",          h.InitiateTransfer)
		v1.POST("/transfer/reverse",           h.ReverseTransfer)

		// Disputes
		v1.POST("/dispute/create",             h.CreateDispute)
		v1.POST("/dispute/:disputeId/resolve", h.ResolveDispute)

		// KYC
		v1.POST("/kyc/submit",                         h.SubmitKYC)
		v1.POST("/kyc/:submissionId/update-status",    h.UpdateKYCStatus)

		// Settlement
		v1.POST("/settlement/trigger",         h.TriggerSettlement)

		// Ledger (TigerBeetle)
		v1.POST("/ledger/debit",               h.DebitWallet)
		v1.POST("/ledger/credit",              h.CreditWallet)
		v1.POST("/ledger/balance",             h.GetWalletBalance)

		// Roles sync
		v1.POST("/roles/sync",                 h.SyncRoles)

		// Domain expansions
		v1.POST("/cbdc/swap",                  h.CBDCAtomicSwap)
		v1.POST("/g2p/disbursement",           h.G2PDisbursement)
		v1.POST("/remittance/create",          h.CreateRemittance)
		v1.POST("/momo/reconcile",             h.ReconcileMoMo)
	}

	// ── NextHub national switch ledger routes (TigerBeetle) ──────────────────
	nexthub := r.Group("/nexthub", bMiddleware.InternalKeyAuth(cfg.InternalKey))
	{
		// Account provisioning
		nexthub.POST("/ledger/provision-participant",  h.ProvisionParticipantAccounts)
		nexthub.POST("/ledger/provision-nqr-merchant", h.ProvisionNqrMerchantAccount)
		nexthub.POST("/ledger/provision-cbdc-wallet",  h.ProvisionCbdcWalletAccount)

		// Transfer posting
		nexthub.POST("/ledger/nip-transfer",           h.PostNipTransfer)
		nexthub.POST("/ledger/pisp-reserve",           h.ReservePispPayment)
		nexthub.POST("/ledger/pisp-commit",            h.CommitPispPayment)
		nexthub.POST("/ledger/pisp-void",              h.VoidPispPayment)
		nexthub.POST("/ledger/bulk-transfer-leg",      h.PostBulkTransferLeg)
		nexthub.POST("/ledger/fx-conversion",          h.PostFxConversion)
		nexthub.POST("/ledger/remittance-transfer",    h.PostRemittanceTransfer)

		// Two-phase settlement
		nexthub.POST("/ledger/settlement-prepare",     h.PrepareSettlementWindow)
		nexthub.POST("/ledger/settlement-commit",      h.CommitSettlementWindow)
		nexthub.POST("/ledger/settlement-void",        h.VoidSettlementWindow)

		// Dispute reversal
		nexthub.POST("/ledger/dispute-reversal",        h.PostDisputeReversal)

		// Balance queries
		nexthub.POST("/ledger/account-balance",        h.GetAccountBalance)
		nexthub.POST("/ledger/batch-balances",         h.BatchGetAccountBalances)
	}

	// ── Infrastructure routes (APISIX, Dapr, Fluvio, Permify, Lakehouse, WAF, Keycloak) ──
	infra := r.Group("/v1", bMiddleware.InternalKeyAuth(cfg.InternalKey))
	{
		// APISIX Admin
		infra.PUT("/apisix/routes",                 h.UpsertApisixRoute)
		infra.PUT("/apisix/consumers",              h.UpsertApisixConsumer)
		infra.DELETE("/apisix/routes/:routeId",     h.DeleteApisixRoute)
		// Dapr
		infra.POST("/dapr/state",                   h.DaprSetState)
		infra.GET("/dapr/state/:key",               h.DaprGetState)
		infra.POST("/dapr/publish",                 h.DaprPublish)
		// Fluvio
		infra.POST("/fluvio/produce",               h.FluvioProduce)
		infra.POST("/fluvio/topics",                h.FluvioCreateTopic)
		infra.GET("/fluvio/topics/:topic/stats",    h.FluvioTopicStats)
		// Permify PBAC
		infra.POST("/permify/check",                h.PermifyCheck)
		infra.POST("/permify/relationships/write",  h.PermifyWriteRelationship)
		infra.POST("/permify/relationships/delete", h.PermifyDeleteRelationship)
		infra.POST("/permify/expand",               h.PermifyExpandPermissions)
		// Lakehouse
		infra.POST("/lakehouse/events",             h.WriteLakehouseEvent)
		infra.POST("/lakehouse/query",              h.QueryLakehouseCompliance)
		infra.GET("/lakehouse/reports",             h.GetLakehouseReport)
		// OpenAppSec WAF
		infra.PUT("/openappsec/policies",           h.UpsertOpenappsecPolicy)
		infra.GET("/openappsec/alerts",             h.GetOpenappsecAlerts)
		// Keycloak
		infra.POST("/keycloak/provision",           h.KeycloakProvisionUser)
		// MOSIP IDA eKYC + eSignet OIDC4VP/OIDC4VCI
		infra.POST("/mosip/otp",                    h.GenerateOTP)
		infra.POST("/mosip/ekyc",                   h.SubmitEKYC)
		infra.POST("/mosip/esignet/auth-url",       h.GetESignetAuthURL)
		infra.POST("/mosip/esignet/token",          h.ExchangeESignetCode)
		infra.POST("/mosip/vc/issue",               h.IssueVerifiableCredential)
		infra.POST("/mosip/g2p/verify-beneficiary", h.VerifyG2PBeneficiary)

		// MOSIP Citizen Registration Pipeline
		infra.POST("/mosip/registration/pre-reg",               h.HandlePreRegCreate)
		infra.GET("/mosip/registration/pre-reg/:aid",           h.HandlePreRegGet)
		infra.POST("/mosip/registration/appointment",           h.HandleBookAppointment)
		infra.DELETE("/mosip/registration/appointment/:aid",    h.HandleCancelAppointment)
		infra.POST("/mosip/registration/packet",                h.HandlePacketUpload)
		infra.GET("/mosip/registration/packet/:rid/status",     h.HandlePacketStatus)
		infra.GET("/mosip/registration/uin/:uin",               h.HandleUINStatus)
		infra.PUT("/mosip/registration/uin",                    h.HandleUINUpdate)
		infra.POST("/mosip/registration/uin/lock",              h.HandleUINLock)
		infra.POST("/mosip/registration/uin/unlock",            h.HandleUINUnlock)
		infra.POST("/mosip/registration/vid",                   h.HandleVIDGenerate)
		infra.POST("/mosip/registration/credential",            h.HandleCredentialRequest)
		infra.GET("/mosip/registration/credential/:requestId",  h.HandleCredentialStatus)
		// Face Biometric — next-generation facial recognition + liveness
		infra.POST("/face/verify",     h.HandleFaceVerify)
		infra.POST("/face/liveness",   h.HandleFaceLiveness)
		infra.POST("/face/quality",    h.HandleFaceQuality)
		infra.POST("/face/enroll",     h.HandleFaceEnroll)
		infra.POST("/face/identify",       h.HandleFaceIdentify)
		infra.POST("/face/batch-identify", h.HandleFaceBatchIdentify)
		infra.GET("/face/public-key",      h.HandleFacePublicKey)
		infra.POST("/face/name-match",     h.HandleNameMatch)
	}
	// ── Partner Public API (X-API-Key auth + per-key rate limiting) ──────────
	// Third-party apps, cameras, and integrators use this route group.
	// Authentication: X-API-Key: nhfb_<key>  or  Authorization: Bearer nhfb_<key>
	if partnerDB != nil && partnerRedis != nil {
		partnerAuth := bMiddleware.PartnerAuth(partnerDB, partnerRedis)
		partner := r.Group("/partner/v1")
		partner.Use(partnerAuth)
		{
			// Connectivity check
			partner.GET("/face/ping", h.PartnerPing)
			// Face verification (1:1) — scope: face:verify
			partner.POST("/face/verify",
				bMiddleware.RequireScope("face:verify"),
				h.PartnerFaceVerify)
			// Liveness / anti-spoofing — scope: face:liveness
			partner.POST("/face/liveness",
				bMiddleware.RequireScope("face:liveness"),
				h.PartnerFaceLiveness)
			// Quality assessment — scope: face:quality
			partner.POST("/face/quality",
				bMiddleware.RequireScope("face:quality"),
				h.PartnerFaceQuality)
			// Enrollment — scope: face:enroll
			partner.POST("/face/enroll",
				bMiddleware.RequireScope("face:enroll"),
				h.PartnerFaceEnroll)
			// 1:N Identification — scope: face:identify
			partner.POST("/face/identify",
				bMiddleware.RequireScope("face:identify"),
				h.PartnerFaceIdentify)
			// Batch 1:N Identification — scope: face:identify
			partner.POST("/face/batch-identify",
				bMiddleware.RequireScope("face:identify"),
				h.HandleFaceBatchIdentify)
			// RS256 public key for verifying signed assertions (public endpoint)
			partner.GET("/face/public-key", h.HandleFacePublicKey)
		}
	} else {
		log.Warn("partner_api_disabled", zap.String("reason", "DB or Redis unavailable"))
	}
	// ── Kafka + Temporal routes (internal) ──────────────────────────────────
	infra2 := r.Group("/v1", bMiddleware.InternalKeyAuth(cfg.InternalKey))
	{
		// Kafka direct
		infra2.POST("/kafka/publish",                h.KafkaPublish)
		// Temporal proxy
		infra2.POST("/temporal/workflows",                      h.TemporalStartWorkflow)
		infra2.GET("/temporal/workflows/:workflowId",           h.TemporalGetWorkflowStatus)
		infra2.POST("/temporal/workflows/:workflowId/signal",   h.TemporalSignalWorkflow)
		infra2.POST("/temporal/workflows/:workflowId/cancel",   h.TemporalCancelWorkflow)
	}

	// ── HTTP server ───────────────────────────────────────────────────────────
	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	go func() {
		log.Info("bridge_listening", zap.String("addr", srv.Addr))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal("bridge_listen_failed", zap.Error(err))
		}
	}()

	// ── Graceful shutdown ─────────────────────────────────────────────────────
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info("bridge_shutting_down")
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Error("bridge_shutdown_error", zap.Error(err))
	}
	if temporalClient != nil {
		temporalClient.Stop()
	}
	log.Info("bridge_stopped")
}
