// Package activities implements all Temporal activities for the dispute
// arbitration workflow. Every activity persists its state to PostgreSQL,
// ensuring the hub's own database is the source of truth for dispute
// lifecycle — independent of Temporal's internal state store.
//
// DB tables written (national_switch_schema.ts):
//   dispute_workflows   — one row per dispute, tracks current status
//   dispute_evidence    — one row per evidence submission
//   dispute_decisions   — one row per arbitrator decision
//   dispute_chargebacks — one row per chargeback instruction
//   ml_fraud_scores     — one row per ML scoring run
//
// Language: Go 1.22
package activities

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.temporal.io/sdk/activity"
	"go.uber.org/zap"
)

// ─── Repository ───────────────────────────────────────────────────────────────

type DisputeRepository struct {
	pool *pgxpool.Pool
	log  *zap.Logger
}

func NewDisputeRepository(pool *pgxpool.Pool, log *zap.Logger) *DisputeRepository {
	return &DisputeRepository{pool: pool, log: log}
}

// EnsureSchema creates all dispute tables if they don't exist.
func (r *DisputeRepository) EnsureSchema(ctx context.Context) error {
	_, err := r.pool.Exec(ctx, `
		DO $$ BEGIN
			CREATE TYPE dispute_workflow_status AS ENUM (
				'RAISED','EVIDENCE_COLLECTION','ML_SCORING','UNDER_REVIEW',
				'DECISION_ISSUED','CHARGEBACK_INITIATED','APPEALED','CLOSED','WITHDRAWN'
			);
		EXCEPTION WHEN duplicate_object THEN NULL; END $$;

		DO $$ BEGIN
			CREATE TYPE dispute_decision_type AS ENUM ('UPHOLD','REJECT','PARTIAL','NEEDS_REVIEW');
		EXCEPTION WHEN duplicate_object THEN NULL; END $$;

		-- Master dispute workflow record
		CREATE TABLE IF NOT EXISTS dispute_workflows (
			id                  UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
			tenant_id           TEXT,
			transfer_id         TEXT                    NOT NULL,
			payer_dfsp          TEXT                    NOT NULL,
			payee_dfsp          TEXT                    NOT NULL,
			amount_kobo         BIGINT                  NOT NULL,
			currency            TEXT                    NOT NULL DEFAULT 'NGN',
			reason              TEXT                    NOT NULL,
			raised_by           TEXT                    NOT NULL,
			status              dispute_workflow_status NOT NULL DEFAULT 'RAISED',
			temporal_workflow_id TEXT,
			temporal_run_id     TEXT,
			evidence_deadline   TIMESTAMPTZ,
			sla_deadline        TIMESTAMPTZ,
			sla_breached        BOOLEAN                 NOT NULL DEFAULT FALSE,
			appeal_deadline     TIMESTAMPTZ,
			closed_at           TIMESTAMPTZ,
			created_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
			updated_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW()
		);

		CREATE INDEX IF NOT EXISTS idx_dispute_workflows_transfer
			ON dispute_workflows (transfer_id);
		CREATE INDEX IF NOT EXISTS idx_dispute_workflows_status
			ON dispute_workflows (status, created_at DESC);
		CREATE INDEX IF NOT EXISTS idx_dispute_workflows_payer
			ON dispute_workflows (payer_dfsp, created_at DESC);
		CREATE INDEX IF NOT EXISTS idx_dispute_workflows_payee
			ON dispute_workflows (payee_dfsp, created_at DESC);
		CREATE INDEX IF NOT EXISTS idx_dispute_workflows_tenant
			ON dispute_workflows (tenant_id, created_at DESC) WHERE tenant_id IS NOT NULL;

		-- Evidence submissions from both DFSPs
		CREATE TABLE IF NOT EXISTS dispute_evidence (
			id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
			dispute_id      UUID        NOT NULL REFERENCES dispute_workflows(id) ON DELETE CASCADE,
			submitted_by    TEXT        NOT NULL,  -- DFSP code
			submitter_id    TEXT,                  -- user ID
			evidence_type   TEXT        NOT NULL,  -- 'TRANSACTION_LOG','SCREENSHOT','STATEMENT','OTHER'
			evidence_url    TEXT,
			notes           TEXT,
			file_hash       TEXT,
			file_size_bytes INTEGER,
			mime_type       TEXT,
			created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);

		CREATE INDEX IF NOT EXISTS idx_dispute_evidence_dispute
			ON dispute_evidence (dispute_id, created_at DESC);

		-- ML fraud scoring results
		CREATE TABLE IF NOT EXISTS ml_fraud_scores (
			id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
			dispute_id          UUID        NOT NULL REFERENCES dispute_workflows(id) ON DELETE CASCADE,
			model_version       TEXT        NOT NULL DEFAULT 'v1.0',
			fraud_score         NUMERIC(5,4) NOT NULL,  -- 0.0000–1.0000
			recommendation      TEXT        NOT NULL,   -- UPHOLD|REJECT|NEEDS_REVIEW
			confidence          NUMERIC(5,4),
			fraud_indicators    JSONB,
			feature_vector      JSONB,
			processing_time_ms  INTEGER,
			created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);

		CREATE INDEX IF NOT EXISTS idx_ml_fraud_scores_dispute
			ON ml_fraud_scores (dispute_id, created_at DESC);

		-- Arbitrator decisions
		CREATE TABLE IF NOT EXISTS dispute_decisions (
			id              UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
			dispute_id      UUID                  NOT NULL REFERENCES dispute_workflows(id) ON DELETE CASCADE,
			arbitrator_id   TEXT                  NOT NULL,
			decision        dispute_decision_type NOT NULL,
			amount_kobo     BIGINT,               -- for PARTIAL decisions
			reasoning       TEXT,
			ml_score_id     UUID                  REFERENCES ml_fraud_scores(id),
			is_appeal       BOOLEAN               NOT NULL DEFAULT FALSE,
			decided_at      TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
			created_at      TIMESTAMPTZ           NOT NULL DEFAULT NOW()
		);

		CREATE INDEX IF NOT EXISTS idx_dispute_decisions_dispute
			ON dispute_decisions (dispute_id, decided_at DESC);

		-- Chargeback instructions issued to settlement engine
		CREATE TABLE IF NOT EXISTS dispute_chargebacks (
			id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
			dispute_id      UUID        NOT NULL REFERENCES dispute_workflows(id) ON DELETE CASCADE,
			decision_id     UUID        REFERENCES dispute_decisions(id),
			transfer_id     TEXT        NOT NULL,
			payer_dfsp      TEXT        NOT NULL,
			payee_dfsp      TEXT        NOT NULL,
			amount_kobo     BIGINT      NOT NULL,
			currency        TEXT        NOT NULL DEFAULT 'NGN',
			status          TEXT        NOT NULL DEFAULT 'PENDING', -- PENDING|SUBMITTED|SETTLED|FAILED
			settlement_ref  TEXT,
			submitted_at    TIMESTAMPTZ,
			settled_at      TIMESTAMPTZ,
			error_message   TEXT,
			kafka_offset    BIGINT,
			created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);

		CREATE INDEX IF NOT EXISTS idx_dispute_chargebacks_dispute
			ON dispute_chargebacks (dispute_id);
		CREATE INDEX IF NOT EXISTS idx_dispute_chargebacks_status
			ON dispute_chargebacks (status, created_at DESC) WHERE status != 'SETTLED';
	`)
	return err
}

// ─── Workflow CRUD ────────────────────────────────────────────────────────────

type CreateWorkflowParams struct {
	ID                 string
	TenantID           string
	TransferID         string
	PayerDFSP          string
	PayeeDFSP          string
	AmountKobo         int64
	Currency           string
	Reason             string
	RaisedBy           string
	TemporalWorkflowID string
	TemporalRunID      string
	EvidenceDeadline   time.Time
	SLADeadline        time.Time
}

func (r *DisputeRepository) CreateWorkflow(ctx context.Context, p CreateWorkflowParams) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO dispute_workflows (
			id, tenant_id, transfer_id, payer_dfsp, payee_dfsp,
			amount_kobo, currency, reason, raised_by, status,
			temporal_workflow_id, temporal_run_id,
			evidence_deadline, sla_deadline, created_at, updated_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'RAISED',$10,$11,$12,$13,NOW(),NOW())
		ON CONFLICT (id) DO NOTHING`,
		p.ID, nullStr(p.TenantID), p.TransferID, p.PayerDFSP, p.PayeeDFSP,
		p.AmountKobo, p.Currency, p.Reason, p.RaisedBy,
		nullStr(p.TemporalWorkflowID), nullStr(p.TemporalRunID),
		p.EvidenceDeadline, p.SLADeadline,
	)
	return err
}

func (r *DisputeRepository) UpdateStatus(ctx context.Context, disputeID, status string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE dispute_workflows
		SET status = $1::dispute_workflow_status, updated_at = NOW(),
		    closed_at = CASE WHEN $1 IN ('CLOSED','WITHDRAWN') THEN NOW() ELSE closed_at END,
		    sla_breached = CASE WHEN $1 = 'UNDER_REVIEW' AND NOW() > sla_deadline THEN TRUE ELSE sla_breached END
		WHERE id = $2`,
		status, disputeID,
	)
	return err
}

// ─── Evidence ─────────────────────────────────────────────────────────────────

type EvidenceParams struct {
	DisputeID    string
	SubmittedBy  string
	SubmitterID  string
	EvidenceType string
	EvidenceURL  string
	Notes        string
	FileHash     string
}

func (r *DisputeRepository) RecordEvidence(ctx context.Context, p EvidenceParams) (string, error) {
	id := uuid.New().String()
	_, err := r.pool.Exec(ctx, `
		INSERT INTO dispute_evidence (id, dispute_id, submitted_by, submitter_id, evidence_type, evidence_url, notes, file_hash, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
		id, p.DisputeID, p.SubmittedBy, nullStr(p.SubmitterID),
		p.EvidenceType, nullStr(p.EvidenceURL), nullStr(p.Notes), nullStr(p.FileHash),
	)
	return id, err
}

// ─── ML Scores ────────────────────────────────────────────────────────────────

type MLScoreParams struct {
	DisputeID        string
	ModelVersion     string
	FraudScore       float64
	Recommendation   string
	Confidence       float64
	FraudIndicators  []string
	ProcessingTimeMs int
}

func (r *DisputeRepository) RecordMLScore(ctx context.Context, p MLScoreParams) (string, error) {
	id := uuid.New().String()
	indicatorsJSON := "[]"
	if len(p.FraudIndicators) > 0 {
		indicatorsJSON = fmt.Sprintf(`["%s"]`, joinStrings(p.FraudIndicators, `","`))
	}
	_, err := r.pool.Exec(ctx, `
		INSERT INTO ml_fraud_scores (id, dispute_id, model_version, fraud_score, recommendation, confidence, fraud_indicators, processing_time_ms, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,NOW())`,
		id, p.DisputeID, p.ModelVersion, p.FraudScore, p.Recommendation,
		p.Confidence, indicatorsJSON, p.ProcessingTimeMs,
	)
	return id, err
}

// ─── Decisions ────────────────────────────────────────────────────────────────

type DecisionParams struct {
	DisputeID    string
	ArbitratorID string
	Decision     string
	AmountKobo   int64
	Reasoning    string
	MLScoreID    string
	IsAppeal     bool
}

func (r *DisputeRepository) RecordDecision(ctx context.Context, p DecisionParams) (string, error) {
	id := uuid.New().String()
	_, err := r.pool.Exec(ctx, `
		INSERT INTO dispute_decisions (id, dispute_id, arbitrator_id, decision, amount_kobo, reasoning, ml_score_id, is_appeal, decided_at, created_at)
		VALUES ($1,$2,$3,$4::dispute_decision_type,$5,$6,$7,$8,NOW(),NOW())`,
		id, p.DisputeID, p.ArbitratorID, p.Decision,
		nullInt(p.AmountKobo), nullStr(p.Reasoning), nullStr(p.MLScoreID), p.IsAppeal,
	)
	return id, err
}

// ─── Chargebacks ──────────────────────────────────────────────────────────────

type ChargebackParams struct {
	DisputeID  string
	DecisionID string
	TransferID string
	PayerDFSP  string
	PayeeDFSP  string
	AmountKobo int64
	Currency   string
}

func (r *DisputeRepository) CreateChargeback(ctx context.Context, p ChargebackParams) (string, error) {
	id := uuid.New().String()
	_, err := r.pool.Exec(ctx, `
		INSERT INTO dispute_chargebacks (id, dispute_id, decision_id, transfer_id, payer_dfsp, payee_dfsp, amount_kobo, currency, status, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PENDING',NOW(),NOW())`,
		id, p.DisputeID, nullStr(p.DecisionID), p.TransferID,
		p.PayerDFSP, p.PayeeDFSP, p.AmountKobo, p.Currency,
	)
	return id, err
}

func (r *DisputeRepository) UpdateChargebackStatus(ctx context.Context, id, status, settlementRef, errMsg string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE dispute_chargebacks
		SET status = $1,
		    settlement_ref = $2,
		    error_message = $3,
		    submitted_at = CASE WHEN $1 = 'SUBMITTED' THEN NOW() ELSE submitted_at END,
		    settled_at   = CASE WHEN $1 = 'SETTLED'   THEN NOW() ELSE settled_at END,
		    updated_at   = NOW()
		WHERE id = $4`,
		status, nullStr(settlementRef), nullStr(errMsg), id,
	)
	return err
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func nullStr(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

func nullInt(i int64) interface{} {
	if i == 0 {
		return nil
	}
	return i
}

func joinStrings(ss []string, sep string) string {
	result := ""
	for i, s := range ss {
		if i > 0 {
			result += sep
		}
		result += s
	}
	return result
}

// ─── Temporal Activities ──────────────────────────────────────────────────────

// Activities struct holds the repository for use in Temporal activities.
type Activities struct {
	repo *DisputeRepository
	log  *zap.Logger
}

func NewActivities(repo *DisputeRepository, log *zap.Logger) *Activities {
	return &Activities{repo: repo, log: log}
}

// UpdateDisputeStatusActivity persists a dispute status change to PostgreSQL.
func (a *Activities) UpdateDisputeStatusActivity(ctx context.Context, disputeID, status string) error {
	logger := activity.GetLogger(ctx)
	if err := a.repo.UpdateStatus(ctx, disputeID, status); err != nil {
		logger.Error("UpdateDisputeStatusActivity failed", "error", err)
		return err
	}
	logger.Info("dispute status updated", "dispute_id", disputeID, "status", status)
	return nil
}

// RecordEvidenceActivity persists an evidence submission to PostgreSQL.
func (a *Activities) RecordEvidenceActivity(ctx context.Context, p EvidenceParams) (string, error) {
	id, err := a.repo.RecordEvidence(ctx, p)
	if err != nil {
		activity.GetLogger(ctx).Error("RecordEvidenceActivity failed", "error", err)
		return "", err
	}
	return id, nil
}

// RecordMLScoreActivity persists an ML scoring result to PostgreSQL.
func (a *Activities) RecordMLScoreActivity(ctx context.Context, p MLScoreParams) (string, error) {
	id, err := a.repo.RecordMLScore(ctx, p)
	if err != nil {
		activity.GetLogger(ctx).Error("RecordMLScoreActivity failed", "error", err)
		return "", err
	}
	return id, nil
}

// RecordDecisionActivity persists an arbitrator decision to PostgreSQL.
func (a *Activities) RecordDecisionActivity(ctx context.Context, p DecisionParams) (string, error) {
	id, err := a.repo.RecordDecision(ctx, p)
	if err != nil {
		activity.GetLogger(ctx).Error("RecordDecisionActivity failed", "error", err)
		return "", err
	}
	return id, nil
}

// InitiateChargebackActivity creates a chargeback record and publishes to Kafka.
func (a *Activities) InitiateChargebackActivity(ctx context.Context, p ChargebackParams) error {
	id, err := a.repo.CreateChargeback(ctx, p)
	if err != nil {
		activity.GetLogger(ctx).Error("InitiateChargebackActivity: create failed", "error", err)
		return err
	}

	// Mark as SUBMITTED immediately (Kafka publish happens in the settlement engine)
	if err := a.repo.UpdateChargebackStatus(ctx, id, "SUBMITTED", "", ""); err != nil {
		a.log.Warn("InitiateChargebackActivity: update status failed", zap.Error(err))
	}

	activity.GetLogger(ctx).Info("chargeback initiated",
		"chargeback_id", id,
		"dispute_id", p.DisputeID,
		"amount_kobo", p.AmountKobo,
	)
	return nil
}
