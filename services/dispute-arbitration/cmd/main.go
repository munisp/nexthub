// Package main is the entry point for the NextHub Dispute Arbitration Service.
//
// This service runs as a Temporal worker, polling the "dispute-arbitration"
// task queue and executing DisputeArbitrationWorkflow activities.
//
// Every workflow state transition, evidence submission, ML score, arbitrator
// decision, and chargeback instruction is persisted to PostgreSQL via the
// DisputeRepository in the activities package.
//
// It also exposes:
//   - HTTP health probe (port 8241)
//   - POST /api/v1/disputes/start — start a new dispute workflow
//   - POST /api/v1/disputes/:id/signal — send a signal to a running workflow
//
// Language: Go 1.22 (Temporal SDK v1.26)
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/worker"
	"go.uber.org/zap"

	"github.com/munisp/nexthub/services/dispute-arbitration/internal/activities"
	"github.com/munisp/nexthub/services/dispute-arbitration/internal/workflows"
)

const (
	taskQueue         = "dispute-arbitration"
	temporalNamespace = "nexthub"
)

func main() {
	log, _ := zap.NewProduction()
	defer log.Sync()

	log.Info("dispute_arbitration.starting")

	// ── PostgreSQL pool ───────────────────────────────────────────────────────
	dbURL := mustEnv("DATABASE_URL")
	pool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		log.Fatal("dispute_arbitration.db_connect_failed", zap.Error(err))
	}
	defer pool.Close()

	repo := activities.NewDisputeRepository(pool, log)
	if err := repo.EnsureSchema(context.Background()); err != nil {
		log.Fatal("dispute_arbitration.schema_init_failed", zap.Error(err))
	}
	log.Info("dispute_arbitration.db_connected")

	acts := activities.NewActivities(repo, log)

	// ── Temporal client ───────────────────────────────────────────────────────
	temporalHost := getEnv("TEMPORAL_HOST", "temporal-frontend:7233")
	c, err := client.Dial(client.Options{
		HostPort:  temporalHost,
		Namespace: temporalNamespace,
		Logger:    newTemporalLogger(log),
	})
	if err != nil {
		log.Fatal("dispute_arbitration.temporal_connect_failed", zap.Error(err))
	}
	defer c.Close()

	log.Info("dispute_arbitration.temporal_connected",
		zap.String("host", temporalHost),
		zap.String("namespace", temporalNamespace),
	)

	// ── Temporal worker ───────────────────────────────────────────────────────
	w := worker.New(c, taskQueue, worker.Options{
		MaxConcurrentActivityExecutionSize:      50,
		MaxConcurrentWorkflowTaskExecutionSize:  20,
		MaxConcurrentLocalActivityExecutionSize: 100,
	})

	// Register workflow
	w.RegisterWorkflow(workflows.DisputeArbitrationWorkflow)

	// Register DB-persisting activities (replaces the stub no-ops in workflows package)
	w.RegisterActivity(acts.UpdateDisputeStatusActivity)
	w.RegisterActivity(acts.RecordEvidenceActivity)
	w.RegisterActivity(acts.RecordMLScoreActivity)
	w.RegisterActivity(acts.RecordDecisionActivity)
	w.RegisterActivity(acts.InitiateChargebackActivity)

	// Register remaining stub activities from workflows package
	w.RegisterActivity(workflows.ScoreDisputeActivity)
	w.RegisterActivity(workflows.NotifyArbitratorsActivity)

	// ── HTTP server ───────────────────────────────────────────────────────────
	mux := http.NewServeMux()

	// Health probe
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		fmt.Fprintf(w, `{"status":"ok","service":"dispute-arbitration","temporal":"%s"}`, temporalHost)
	})

	// Start dispute workflow — also creates the DB record
	mux.HandleFunc("/api/v1/disputes/start", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req struct {
			TransferID string `json:"transferId"`
			PayerDFSP  string `json:"payerDfsp"`
			PayeeDFSP  string `json:"payeeDfsp"`
			AmountKobo int64  `json:"amountKobo"`
			Currency   string `json:"currency"`
			Reason     string `json:"reason"`
			RaisedBy   string `json:"raisedBy"`
			TenantID   string `json:"tenantId"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		disputeID := "dispute-" + uuid.New().String()
		now := time.Now()
		evidenceDeadline := now.Add(48 * time.Hour)
		slaDeadline := now.Add(5 * 24 * time.Hour)

		// Persist to DB first
		if err := repo.CreateWorkflow(r.Context(), activities.CreateWorkflowParams{
			ID:               disputeID,
			TenantID:         req.TenantID,
			TransferID:       req.TransferID,
			PayerDFSP:        req.PayerDFSP,
			PayeeDFSP:        req.PayeeDFSP,
			AmountKobo:       req.AmountKobo,
			Currency:         req.Currency,
			Reason:           req.Reason,
			RaisedBy:         req.RaisedBy,
			EvidenceDeadline: evidenceDeadline,
			SLADeadline:      slaDeadline,
		}); err != nil {
			log.Error("dispute.create_db_failed", zap.Error(err))
			http.Error(w, "database error", http.StatusInternalServerError)
			return
		}

		// Start Temporal workflow
		run, err := c.ExecuteWorkflow(r.Context(), client.StartWorkflowOptions{
			ID:        disputeID,
			TaskQueue: taskQueue,
		}, workflows.DisputeArbitrationWorkflow, workflows.DisputeInput{
			DisputeID:        disputeID,
			TransferID:       req.TransferID,
			PayerDFSP:        req.PayerDFSP,
			PayeeDFSP:        req.PayeeDFSP,
			Amount:           req.AmountKobo,
			Currency:         req.Currency,
			Reason:           req.Reason,
			RaisedBy:         req.RaisedBy,
			TenantID:         req.TenantID,
			EvidenceDeadline: evidenceDeadline,
			SLADeadline:      slaDeadline,
		})
		if err != nil {
			log.Error("dispute.temporal_start_failed", zap.Error(err))
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Update DB with Temporal run ID
		pool.Exec(r.Context(),
			`UPDATE dispute_workflows SET temporal_workflow_id=$1, temporal_run_id=$2, updated_at=NOW() WHERE id=$3`,
			disputeID, run.GetRunID(), disputeID,
		)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"disputeId":  disputeID,
			"runId":      run.GetRunID(),
			"status":     "RAISED",
		})
	})

	// Signal endpoint — submit evidence, decision, appeal, or withdrawal
	mux.HandleFunc("/api/v1/disputes/signal", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req struct {
			DisputeID  string          `json:"disputeId"`
			SignalName string          `json:"signalName"`
			Payload    json.RawMessage `json:"payload"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		var payload interface{}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			http.Error(w, "invalid signal payload", http.StatusBadRequest)
			return
		}

		if err := c.SignalWorkflow(r.Context(), req.DisputeID, "", req.SignalName, payload); err != nil {
			log.Error("dispute.signal_failed", zap.String("dispute_id", req.DisputeID), zap.Error(err))
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"ok":true,"disputeId":"%s","signal":"%s"}`, req.DisputeID, req.SignalName)
	})

	httpServer := &http.Server{
		Addr:         ":8241",
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}
	go func() {
		log.Info("dispute_arbitration.http_server_started", zap.String("addr", ":8241"))
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Error("http_server_error", zap.Error(err))
		}
	}()

	// ── Start Temporal worker ─────────────────────────────────────────────────
	if err := w.Start(); err != nil {
		log.Fatal("dispute_arbitration.worker_start_failed", zap.Error(err))
	}
	log.Info("dispute_arbitration.worker_started", zap.String("task_queue", taskQueue))

	// ── Graceful shutdown ─────────────────────────────────────────────────────
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)
	<-quit

	log.Info("dispute_arbitration.shutting_down")
	w.Stop()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(ctx); err != nil {
		log.Error("http_server_shutdown_error", zap.Error(err))
	}
	log.Info("dispute_arbitration.stopped")
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

// temporalLogger wraps zap.Logger for the Temporal SDK logger interface.
type temporalLogger struct{ log *zap.Logger }

func newTemporalLogger(log *zap.Logger) *temporalLogger { return &temporalLogger{log: log} }
func (l *temporalLogger) Debug(msg string, keyvals ...interface{}) {
	l.log.Debug(msg, zap.Any("keyvals", keyvals))
}
func (l *temporalLogger) Info(msg string, keyvals ...interface{}) {
	l.log.Info(msg, zap.Any("keyvals", keyvals))
}
func (l *temporalLogger) Warn(msg string, keyvals ...interface{}) {
	l.log.Warn(msg, zap.Any("keyvals", keyvals))
}
func (l *temporalLogger) Error(msg string, keyvals ...interface{}) {
	l.log.Error(msg, zap.Any("keyvals", keyvals))
}
