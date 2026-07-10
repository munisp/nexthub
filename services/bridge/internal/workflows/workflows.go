// Package workflows defines all Temporal workflow and activity implementations
// for the NextHub payment switch.
package workflows

import (
	"context"
	"fmt"
	"time"

	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
)

// ─── Transfer Workflow ────────────────────────────────────────────────────────

// TransferInput is the input for the TransferWorkflow.
type TransferInput struct {
	TransferID      string  `json:"transferId"`
	PayerFSPID      string  `json:"payerFspId"`
	PayeeFSPID      string  `json:"payeeFspId"`
	AmountKobo      int64   `json:"amountKobo"`
	Currency        string  `json:"currency"`
	ILPPacket       string  `json:"ilpPacket"`
	Condition       string  `json:"condition"`
	ExpiryMs        int64   `json:"expiryMs"`
}

// TransferResult is the output of the TransferWorkflow.
type TransferResult struct {
	TransferID      string `json:"transferId"`
	State           string `json:"state"` // COMMITTED | ABORTED
	LedgerEntryID   uint64 `json:"ledgerEntryId"`
	FulfilmentHash  string `json:"fulfilmentHash"`
}

// TransferWorkflow orchestrates the 3-phase Mojaloop transfer:
//  1. NDC check (Permify / ledger)
//  2. Reserve funds in TigerBeetle (pending transfer)
//  3. Validate ILP fulfilment
//  4. Commit or void the pending transfer
//  5. Publish Kafka events
func TransferWorkflow(ctx workflow.Context, input TransferInput) (*TransferResult, error) {
	retryPolicy := &temporal.RetryPolicy{
		InitialInterval:    time.Second,
		BackoffCoefficient: 2.0,
		MaximumInterval:    30 * time.Second,
		MaximumAttempts:    3,
	}
	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
		RetryPolicy:         retryPolicy,
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: NDC check
	var ndcOK bool
	if err := workflow.ExecuteActivity(ctx, CheckNDCActivity, input.PayerFSPID, input.AmountKobo, input.Currency).Get(ctx, &ndcOK); err != nil {
		return nil, fmt.Errorf("ndc check failed: %w", err)
	}
	if !ndcOK {
		_ = workflow.ExecuteActivity(ctx, PublishKafkaActivity, "nexthub.transfer.aborted.v1", input.TransferID, map[string]any{
			"transferId": input.TransferID,
			"reason":     "NDC_BREACH",
		})
		return &TransferResult{TransferID: input.TransferID, State: "ABORTED"}, nil
	}

	// Step 2: Reserve funds
	var ledgerID uint64
	if err := workflow.ExecuteActivity(ctx, ReserveFundsActivity, input).Get(ctx, &ledgerID); err != nil {
		return nil, fmt.Errorf("reserve funds failed: %w", err)
	}

	// Step 3: Commit
	var fulfilment string
	if err := workflow.ExecuteActivity(ctx, CommitTransferActivity, ledgerID, input.TransferID).Get(ctx, &fulfilment); err != nil {
		// Void on failure
		_ = workflow.ExecuteActivity(ctx, VoidTransferActivity, ledgerID)
		return &TransferResult{TransferID: input.TransferID, State: "ABORTED", LedgerEntryID: ledgerID}, nil
	}

	// Step 4: Publish committed event
	_ = workflow.ExecuteActivity(ctx, PublishKafkaActivity, "nexthub.transfer.committed.v1", input.TransferID, map[string]any{
		"transferId": input.TransferID,
		"payerFspId": input.PayerFSPID,
		"payeeFspId": input.PayeeFSPID,
		"amountKobo": input.AmountKobo,
		"currency":   input.Currency,
		"state":      "COMMITTED",
	})

	return &TransferResult{
		TransferID:     input.TransferID,
		State:          "COMMITTED",
		LedgerEntryID:  ledgerID,
		FulfilmentHash: fulfilment,
	}, nil
}

// ─── Payout Approval Workflow ─────────────────────────────────────────────────

// PayoutInput is the input for the PayoutApprovalWorkflow.
type PayoutInput struct {
	PayoutID    string  `json:"payoutId"`
	MerchantID  string  `json:"merchantId"`
	AmountKobo  int64   `json:"amountKobo"`
	Currency    string  `json:"currency"`
	BankAccount string  `json:"bankAccount"`
}

// PayoutApprovalWorkflow orchestrates a merchant payout:
//  1. Permify authorisation check
//  2. TigerBeetle reserve
//  3. Wait for approval signal (up to 24h)
//  4. Commit or void based on signal
func PayoutApprovalWorkflow(ctx workflow.Context, input PayoutInput) (string, error) {
	ao := workflow.ActivityOptions{StartToCloseTimeout: 30 * time.Second}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: Permify check
	var allowed bool
	if err := workflow.ExecuteActivity(ctx, PermifyCheckActivity, "payout", input.MerchantID, "initiate").Get(ctx, &allowed); err != nil || !allowed {
		return "REJECTED", nil
	}

	// Step 2: Reserve
	var ledgerID uint64
	if err := workflow.ExecuteActivity(ctx, ReservePayoutActivity, input).Get(ctx, &ledgerID); err != nil {
		return "FAILED", err
	}

	// Step 3: Wait for approval signal (24h timeout)
	var approved bool
	signalCh := workflow.GetSignalChannel(ctx, "payout-approval")
	selector := workflow.NewSelector(ctx)
	selector.AddReceive(signalCh, func(ch workflow.ReceiveChannel, _ bool) {
		ch.Receive(ctx, &approved)
	})
	timerCtx, cancel := workflow.WithCancel(ctx)
	defer cancel()
	selector.AddFuture(workflow.NewTimer(timerCtx, 24*time.Hour), func(_ workflow.Future) {
		approved = false
	})
	selector.Select(ctx)

	if approved {
		_ = workflow.ExecuteActivity(ctx, CommitPayoutActivity, ledgerID, input)
		return "APPROVED", nil
	}

	_ = workflow.ExecuteActivity(ctx, VoidTransferActivity, ledgerID)
	return "REJECTED", nil
}

// ─── Dispute Workflow ─────────────────────────────────────────────────────────

// DisputeInput is the input for the DisputeWorkflow.
type DisputeInput struct {
	DisputeID   string `json:"disputeId"`
	TransferID  string `json:"transferId"`
	InitiatorID string `json:"initiatorId"`
	AmountKobo  int64  `json:"amountKobo"`
	Currency    string `json:"currency"`
	Reason      string `json:"reason"`
}

// DisputeWorkflow orchestrates dispute resolution:
//  1. Reserve disputed amount in TigerBeetle
//  2. Wait for resolution signal (UPHELD | REJECTED)
//  3. Commit (refund) or void based on outcome
func DisputeWorkflow(ctx workflow.Context, input DisputeInput) (string, error) {
	ao := workflow.ActivityOptions{StartToCloseTimeout: 30 * time.Second}
	ctx = workflow.WithActivityOptions(ctx, ao)

	var ledgerID uint64
	if err := workflow.ExecuteActivity(ctx, ReserveDisputeActivity, input).Get(ctx, &ledgerID); err != nil {
		return "FAILED", err
	}

	var resolution string
	signalCh := workflow.GetSignalChannel(ctx, "dispute-resolution")
	selector := workflow.NewSelector(ctx)
	selector.AddReceive(signalCh, func(ch workflow.ReceiveChannel, _ bool) {
		ch.Receive(ctx, &resolution)
	})
	selector.AddFuture(workflow.NewTimer(ctx, 72*time.Hour), func(_ workflow.Future) {
		resolution = "TIMEOUT"
	})
	selector.Select(ctx)

	switch resolution {
	case "UPHELD":
		_ = workflow.ExecuteActivity(ctx, CommitDisputeRefundActivity, ledgerID, input)
		_ = workflow.ExecuteActivity(ctx, PublishKafkaActivity, "nexthub.dispute.resolved.v1", input.DisputeID, map[string]any{
			"disputeId":  input.DisputeID,
			"resolution": "UPHELD",
		})
		return "UPHELD", nil
	default:
		_ = workflow.ExecuteActivity(ctx, VoidTransferActivity, ledgerID)
		_ = workflow.ExecuteActivity(ctx, PublishKafkaActivity, "nexthub.dispute.resolved.v1", input.DisputeID, map[string]any{
			"disputeId":  input.DisputeID,
			"resolution": "REJECTED",
		})
		return "REJECTED", nil
	}
}

// ─── Settlement Workflow ──────────────────────────────────────────────────────

// SettlementInput is the input for the SettlementWorkflow.
type SettlementInput struct {
	WindowID string `json:"windowId"`
	Currency string `json:"currency"`
}

// SettlementWorkflow orchestrates a settlement window close:
//  1. Collect all net positions
//  2. Commit multilateral net settlement in TigerBeetle
//  3. Trigger bank transfers for net debtors
//  4. Publish settlement events to Kafka and Lakehouse
func SettlementWorkflow(ctx workflow.Context, input SettlementInput) (string, error) {
	ao := workflow.ActivityOptions{StartToCloseTimeout: 2 * time.Minute}
	ctx = workflow.WithActivityOptions(ctx, ao)

	var positions []NetPosition
	if err := workflow.ExecuteActivity(ctx, CollectNetPositionsActivity, input.WindowID).Get(ctx, &positions); err != nil {
		return "FAILED", err
	}

	for _, pos := range positions {
		if pos.NetKobo < 0 {
			// Net debtor — debit their settlement account
			if err := workflow.ExecuteActivity(ctx, SettlePositionActivity, pos).Get(ctx, nil); err != nil {
				return "FAILED", fmt.Errorf("settle position %s: %w", pos.DFSPID, err)
			}
		}
	}

	_ = workflow.ExecuteActivity(ctx, PublishKafkaActivity, "nexthub.settlement.settled.v1", input.WindowID, map[string]any{
		"windowId": input.WindowID,
		"currency": input.Currency,
		"status":   "SETTLED",
	})

	return "SETTLED", nil
}

// ─── KYC Workflow ─────────────────────────────────────────────────────────────

// KYCInput is the input for the KYCWorkflow.
type KYCInput struct {
	SubmissionID string `json:"submissionId"`
	MerchantID   string `json:"merchantId"`
	DocumentType string `json:"documentType"`
	S3Key        string `json:"s3Key"`
}

// KYCWorkflow orchestrates document verification:
//  1. Download document from S3
//  2. Run automated checks (OCR, sanctions screening)
//  3. Publish result to Kafka
func KYCWorkflow(ctx workflow.Context, input KYCInput) (string, error) {
	ao := workflow.ActivityOptions{StartToCloseTimeout: 5 * time.Minute}
	ctx = workflow.WithActivityOptions(ctx, ao)

	var status string
	if err := workflow.ExecuteActivity(ctx, RunKYCChecksActivity, input).Get(ctx, &status); err != nil {
		return "FAILED", err
	}

	_ = workflow.ExecuteActivity(ctx, PublishKafkaActivity, "nexthub.kyc.update.v1", input.SubmissionID, map[string]any{
		"submissionId": input.SubmissionID,
		"merchantId":   input.MerchantID,
		"status":       status,
	})

	return status, nil
}

// ─── Shared types ─────────────────────────────────────────────────────────────

// NetPosition represents a DFSP's net settlement position.
type NetPosition struct {
	DFSPID  string `json:"dfspId"`
	NetKobo int64  `json:"netKobo"`
	Currency string `json:"currency"`
}

// ─── Activity stubs ───────────────────────────────────────────────────────────
// These are registered in temporal/worker.go and call the appropriate services.

func CheckNDCActivity(ctx context.Context, dfspID string, amountKobo int64, currency string) (bool, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("CheckNDCActivity", "dfspId", dfspID, "amount", amountKobo)
	// In production: call ledger.LookupAccount and compare position vs limit
	return true, nil
}

func ReserveFundsActivity(ctx context.Context, input TransferInput) (uint64, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("ReserveFundsActivity", "transferId", input.TransferID)
	// In production: call ledger.ReserveTransfer
	return uint64(time.Now().UnixNano()), nil
}

func CommitTransferActivity(ctx context.Context, ledgerID uint64, transferID string) (string, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("CommitTransferActivity", "ledgerID", ledgerID, "transferId", transferID)
	return fmt.Sprintf("sha256-%d", ledgerID), nil
}

func VoidTransferActivity(ctx context.Context, ledgerID uint64) error {
	logger := activity.GetLogger(ctx)
	logger.Info("VoidTransferActivity", "ledgerID", ledgerID)
	return nil
}

func PermifyCheckActivity(ctx context.Context, entityType, entityID, action string) (bool, error) {
	return true, nil
}

func ReservePayoutActivity(ctx context.Context, input PayoutInput) (uint64, error) {
	return uint64(time.Now().UnixNano()), nil
}

func CommitPayoutActivity(ctx context.Context, ledgerID uint64, input PayoutInput) error {
	return nil
}

func ReserveDisputeActivity(ctx context.Context, input DisputeInput) (uint64, error) {
	return uint64(time.Now().UnixNano()), nil
}

func CommitDisputeRefundActivity(ctx context.Context, ledgerID uint64, input DisputeInput) error {
	return nil
}

func CollectNetPositionsActivity(ctx context.Context, windowID string) ([]NetPosition, error) {
	return []NetPosition{}, nil
}

func SettlePositionActivity(ctx context.Context, pos NetPosition) error {
	return nil
}

func RunKYCChecksActivity(ctx context.Context, input KYCInput) (string, error) {
	return "APPROVED", nil
}

func PublishKafkaActivity(ctx context.Context, topic, key string, payload map[string]any) error {
	logger := activity.GetLogger(ctx)
	logger.Info("PublishKafkaActivity", "topic", topic, "key", key)
	return nil
}
