// Package workflows defines the Temporal workflow for the NextHub
// Dispute Arbitration Tribunal.
//
// The workflow models the full dispute lifecycle:
//
//  1. RAISED      — Dispute filed by payer DFSP
//  2. EVIDENCE    — Both DFSPs submit evidence (48h window)
//  3. ML_SCORING  — Python ML service scores the dispute
//  4. REVIEW      — Hub arbitrator reviews ML recommendation
//  5. DECISION    — Arbitrator issues binding decision
//  6. CHARGEBACK  — If upheld: chargeback instruction sent to settlement
//  7. APPEAL      — Optional 5-day appeal window
//  8. CLOSED      — Final state
//
// Language: Go 1.22 (Temporal SDK v1.26)
package workflows

import (
	"fmt"
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
	"go.uber.org/zap"
)

// ─── Types ────────────────────────────────────────────────────────────────────

type DisputeStatus string

const (
	StatusRaised     DisputeStatus = "RAISED"
	StatusEvidence   DisputeStatus = "EVIDENCE_COLLECTION"
	StatusMLScoring  DisputeStatus = "ML_SCORING"
	StatusReview     DisputeStatus = "UNDER_REVIEW"
	StatusDecision   DisputeStatus = "DECISION_ISSUED"
	StatusChargeback DisputeStatus = "CHARGEBACK_INITIATED"
	StatusAppealed   DisputeStatus = "APPEALED"
	StatusClosed     DisputeStatus = "CLOSED"
)

type DisputeInput struct {
	DisputeID       string
	TransferID      string
	PayerDFSP       string
	PayeeDFSP       string
	Amount          int64  // in kobo
	Currency        string
	Reason          string
	RaisedBy        string
	TenantID        string
	EvidenceDeadline time.Time
	SLADeadline     time.Time
}

type EvidenceSubmission struct {
	DFSP        string
	EvidenceURL string
	Notes       string
	SubmittedAt time.Time
}

type MLScoringResult struct {
	Score           float64 // 0.0–1.0 (1.0 = definitely fraudulent)
	Recommendation  string  // "UPHOLD" | "REJECT" | "NEEDS_REVIEW"
	Confidence      float64
	FraudIndicators []string
}

type ArbitratorDecision struct {
	ArbitratorID string
	Decision     string // "UPHOLD" | "REJECT" | "PARTIAL"
	Amount       int64  // Chargeback amount (may be partial)
	Reasoning    string
	DecidedAt    time.Time
}

type DisputeResult struct {
	DisputeID  string
	FinalStatus DisputeStatus
	Decision   *ArbitratorDecision
	MLScore    *MLScoringResult
	ClosedAt   time.Time
}

// ─── Signals ──────────────────────────────────────────────────────────────────

const (
	SignalEvidenceSubmitted = "evidence_submitted"
	SignalDecisionIssued    = "decision_issued"
	SignalAppealFiled       = "appeal_filed"
	SignalWithdrawn         = "withdrawn"
)

// ─── Workflow ─────────────────────────────────────────────────────────────────

// DisputeArbitrationWorkflow is the main Temporal workflow for dispute resolution.
func DisputeArbitrationWorkflow(ctx workflow.Context, input DisputeInput) (*DisputeResult, error) {
	log := workflow.GetLogger(ctx)
	log.Info("dispute_workflow.started",
		zap.String("dispute_id", input.DisputeID),
		zap.String("transfer_id", input.TransferID),
	)

	// ── Phase 1: Evidence Collection (48 hours) ───────────────────────────────
	if err := updateDisputeStatus(ctx, input.DisputeID, StatusEvidence); err != nil {
		return nil, err
	}

	evidenceCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 5 * time.Minute,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 3,
		},
	})

	var payerEvidence, payeeEvidence *EvidenceSubmission
	evidenceDeadline := workflow.NewTimer(ctx, time.Until(input.EvidenceDeadline))

	payerCh := workflow.GetSignalChannel(ctx, SignalEvidenceSubmitted+":"+input.PayerDFSP)
	payeeCh := workflow.GetSignalChannel(ctx, SignalEvidenceSubmitted+":"+input.PayeeDFSP)
	withdrawnCh := workflow.GetSignalChannel(ctx, SignalWithdrawn)

	evidenceSelector := workflow.NewSelector(ctx)
	evidenceSelector.AddReceive(payerCh, func(c workflow.ReceiveChannel, more bool) {
		c.Receive(ctx, &payerEvidence)
		log.Info("dispute_workflow.payer_evidence_received", zap.String("dispute_id", input.DisputeID))
	})
	evidenceSelector.AddReceive(payeeCh, func(c workflow.ReceiveChannel, more bool) {
		c.Receive(ctx, &payeeEvidence)
		log.Info("dispute_workflow.payee_evidence_received", zap.String("dispute_id", input.DisputeID))
	})
	evidenceSelector.AddReceive(withdrawnCh, func(c workflow.ReceiveChannel, more bool) {
		log.Info("dispute_workflow.withdrawn", zap.String("dispute_id", input.DisputeID))
	})
	evidenceSelector.AddFuture(evidenceDeadline, func(f workflow.Future) {
		log.Info("dispute_workflow.evidence_deadline_reached", zap.String("dispute_id", input.DisputeID))
	})

	// Collect evidence until deadline or both parties submit
	for {
		evidenceSelector.Select(ctx)
		if payerEvidence != nil && payeeEvidence != nil {
			break // Both submitted — proceed early
		}
		if !evidenceSelector.HasPending() {
			break // Deadline reached
		}
	}

	// ── Phase 2: ML Fraud Scoring ─────────────────────────────────────────────
	if err := updateDisputeStatus(ctx, input.DisputeID, StatusMLScoring); err != nil {
		return nil, err
	}

	var mlResult MLScoringResult
	if err := workflow.ExecuteActivity(evidenceCtx, ScoreDisputeActivity, ScoreDisputeInput{
		DisputeID:    input.DisputeID,
		TransferID:   input.TransferID,
		Amount:       input.Amount,
		Reason:       input.Reason,
		PayerEvidence: payerEvidence,
		PayeeEvidence: payeeEvidence,
	}).Get(ctx, &mlResult); err != nil {
		log.Warn("dispute_workflow.ml_scoring_failed_using_default", zap.Error(err))
		mlResult = MLScoringResult{
			Score:          0.5,
			Recommendation: "NEEDS_REVIEW",
			Confidence:     0.0,
		}
	}

	log.Info("dispute_workflow.ml_scored",
		zap.String("dispute_id", input.DisputeID),
		zap.Float64("score", mlResult.Score),
		zap.String("recommendation", mlResult.Recommendation),
	)

	// ── Phase 3: Arbitrator Review ────────────────────────────────────────────
	if err := updateDisputeStatus(ctx, input.DisputeID, StatusReview); err != nil {
		return nil, err
	}

	// Notify arbitrators via Kafka
	notifyCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 2 * time.Minute,
	})
	_ = workflow.ExecuteActivity(notifyCtx, NotifyArbitratorsActivity, NotifyInput{
		DisputeID:      input.DisputeID,
		MLScore:        mlResult.Score,
		Recommendation: mlResult.Recommendation,
	}).Get(ctx, nil)

	// Wait for arbitrator decision (SLA: 5 business days)
	decisionCh := workflow.GetSignalChannel(ctx, SignalDecisionIssued)
	slaTimer := workflow.NewTimer(ctx, time.Until(input.SLADeadline))

	var decision ArbitratorDecision
	decisionSelector := workflow.NewSelector(ctx)
	decisionSelector.AddReceive(decisionCh, func(c workflow.ReceiveChannel, more bool) {
		c.Receive(ctx, &decision)
	})
	decisionSelector.AddFuture(slaTimer, func(f workflow.Future) {
		// SLA breach — auto-escalate
		log.Warn("dispute_workflow.sla_breached_auto_escalating",
			zap.String("dispute_id", input.DisputeID))
		decision = ArbitratorDecision{
			Decision:  "NEEDS_REVIEW",
			Reasoning: "Auto-escalated: SLA deadline breached",
			DecidedAt: workflow.Now(ctx),
		}
	})
	decisionSelector.Select(ctx)

	if err := updateDisputeStatus(ctx, input.DisputeID, StatusDecision); err != nil {
		return nil, err
	}

	// ── Phase 4: Chargeback (if upheld) ──────────────────────────────────────
	if decision.Decision == "UPHOLD" || decision.Decision == "PARTIAL" {
		if err := updateDisputeStatus(ctx, input.DisputeID, StatusChargeback); err != nil {
			return nil, err
		}

		chargebackCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
			StartToCloseTimeout: 10 * time.Minute,
			RetryPolicy: &temporal.RetryPolicy{
				MaximumAttempts:    5,
				InitialInterval:    30 * time.Second,
				BackoffCoefficient: 2.0,
			},
		})

		chargebackAmount := input.Amount
		if decision.Decision == "PARTIAL" {
			chargebackAmount = decision.Amount
		}

		if err := workflow.ExecuteActivity(chargebackCtx, InitiateChargebackActivity, ChargebackInput{
			DisputeID:  input.DisputeID,
			TransferID: input.TransferID,
			PayerDFSP:  input.PayerDFSP,
			PayeeDFSP:  input.PayeeDFSP,
			Amount:     chargebackAmount,
			Currency:   input.Currency,
		}).Get(ctx, nil); err != nil {
			return nil, fmt.Errorf("chargeback failed: %w", err)
		}
	}

	// ── Phase 5: Appeal Window (5 days) ──────────────────────────────────────
	appealCh := workflow.GetSignalChannel(ctx, SignalAppealFiled)
	appealTimer := workflow.NewTimer(ctx, 5*24*time.Hour)

	var appealed bool
	appealSelector := workflow.NewSelector(ctx)
	appealSelector.AddReceive(appealCh, func(c workflow.ReceiveChannel, more bool) {
		appealed = true
	})
	appealSelector.AddFuture(appealTimer, func(f workflow.Future) {})
	appealSelector.Select(ctx)

	finalStatus := StatusClosed
	if appealed {
		finalStatus = StatusAppealed
		if err := updateDisputeStatus(ctx, input.DisputeID, StatusAppealed); err != nil {
			return nil, err
		}
		// Re-enter the workflow for appeal (child workflow)
		// In production: workflow.ExecuteChildWorkflow(ctx, AppealWorkflow, ...)
	}

	if err := updateDisputeStatus(ctx, input.DisputeID, StatusClosed); err != nil {
		return nil, err
	}

	log.Info("dispute_workflow.completed",
		zap.String("dispute_id", input.DisputeID),
		zap.String("final_status", string(finalStatus)),
		zap.String("decision", decision.Decision),
	)

	return &DisputeResult{
		DisputeID:   input.DisputeID,
		FinalStatus: finalStatus,
		Decision:    &decision,
		MLScore:     &mlResult,
		ClosedAt:    workflow.Now(ctx),
	}, nil
}

// ─── Activities ───────────────────────────────────────────────────────────────

type ScoreDisputeInput struct {
	DisputeID     string
	TransferID    string
	Amount        int64
	Reason        string
	PayerEvidence *EvidenceSubmission
	PayeeEvidence *EvidenceSubmission
}

type NotifyInput struct {
	DisputeID      string
	MLScore        float64
	Recommendation string
}

type ChargebackInput struct {
	DisputeID  string
	TransferID string
	PayerDFSP  string
	PayeeDFSP  string
	Amount     int64
	Currency   string
}

// ScoreDisputeActivity calls the Python ML fraud scoring service.
func ScoreDisputeActivity(ctx workflow.Context, input ScoreDisputeInput) (MLScoringResult, error) {
	// This is a stub — the real implementation is in activities/score_dispute.go
	return MLScoringResult{
		Score:          0.5,
		Recommendation: "NEEDS_REVIEW",
		Confidence:     0.5,
	}, nil
}

// NotifyArbitratorsActivity publishes a Kafka event to notify arbitrators.
func NotifyArbitratorsActivity(ctx workflow.Context, input NotifyInput) error {
	return nil // Implemented in activities/notify_arbitrators.go
}

// InitiateChargebackActivity sends a chargeback instruction to the settlement engine.
func InitiateChargebackActivity(ctx workflow.Context, input ChargebackInput) error {
	return nil // Implemented in activities/initiate_chargeback.go
}

// updateDisputeStatus is a helper that persists status changes via an activity.
func updateDisputeStatus(ctx workflow.Context, disputeID string, status DisputeStatus) error {
	actCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 5,
		},
	})
	return workflow.ExecuteActivity(actCtx, UpdateDisputeStatusActivity, disputeID, string(status)).Get(ctx, nil)
}

// UpdateDisputeStatusActivity persists the dispute status to the database.
func UpdateDisputeStatusActivity(ctx workflow.Context, disputeID, status string) error {
	return nil // Implemented in activities/update_status.go
}
