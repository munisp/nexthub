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

	"github.com/munisp/nexthub/bridge/internal/config"
	"github.com/munisp/nexthub/bridge/internal/handlers"
	"github.com/munisp/nexthub/bridge/internal/kafka"
	"github.com/munisp/nexthub/bridge/internal/ledger"
	bMiddleware "github.com/munisp/nexthub/bridge/internal/middleware"
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

	// ── HTTP handlers ─────────────────────────────────────────────────────────
	h := &handlers.Handler{
		Ledger:  ledgerClient,
		Kafka:   kafkaProducer,
		Permify: permifyClient,
		Log:     log,
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
