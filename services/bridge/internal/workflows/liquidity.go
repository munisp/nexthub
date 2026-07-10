// Package workflows — Wave 250: Liquidity Cover Management
//
// This file implements:
//   - LiquidityMonitorWorkflow: polls DFSP positions every N seconds and
//     triggers alerts when NDC thresholds are breached
//   - CollateralDepositWorkflow: processes collateral top-ups and updates
//     the TigerBeetle collateral account
//   - CorridorSettlementWorkflow: closes a multi-currency corridor window
//     and nets positions across all DFSPs in the corridor

package workflows

import (
	"context"
	"fmt"
	"time"

	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/workflow"
)

// ─── Liquidity Monitor Workflow ───────────────────────────────────────────────

// LiquidityMonitorInput configures the continuous liquidity monitor.
type LiquidityMonitorInput struct {
	DFSPID          string  `json:"dfspId"`
	Currency        string  `json:"currency"`
	NDCLimitKobo    int64   `json:"ndcLimitKobo"`
	AlertThresholdPct float64 `json:"alertThresholdPct"` // e.g. 0.80 = alert at 80% utilisation
	PollIntervalSec int     `json:"pollIntervalSec"`
}

// LiquidityMonitorWorkflow runs continuously (as a long-running workflow) and
// publishes Kafka alerts whenever a DFSP's NDC utilisation exceeds the threshold.
func LiquidityMonitorWorkflow(ctx workflow.Context, input LiquidityMonitorInput) error {
	ao := workflow.ActivityOptions{StartToCloseTimeout: 15 * time.Second}
	ctx = workflow.WithActivityOptions(ctx, ao)

	interval := time.Duration(input.PollIntervalSec) * time.Second
	if interval == 0 {
		interval = 30 * time.Second
	}

	for {
		// Poll current position
		var positionKobo int64
		if err := workflow.ExecuteActivity(ctx, GetDFSPPositionActivity, input.DFSPID, input.Currency).Get(ctx, &positionKobo); err != nil {
			// Log and continue — don't fail the workflow on transient errors
			_ = workflow.Sleep(ctx, interval)
			continue
		}

		utilisationPct := float64(positionKobo) / float64(input.NDCLimitKobo)
		if utilisationPct >= input.AlertThresholdPct {
			_ = workflow.ExecuteActivity(ctx, PublishKafkaActivity,
				TopicLiquidityAlert, input.DFSPID, map[string]any{
					"dfspId":          input.DFSPID,
					"currency":        input.Currency,
					"positionKobo":    positionKobo,
					"ndcLimitKobo":    input.NDCLimitKobo,
					"utilisationPct":  utilisationPct,
					"alertLevel":      alertLevel(utilisationPct),
				})
		}

		// Wait for next poll or a stop signal
		stopCh := workflow.GetSignalChannel(ctx, "liquidity-monitor-stop")
		selector := workflow.NewSelector(ctx)
		stopped := false
		selector.AddReceive(stopCh, func(ch workflow.ReceiveChannel, _ bool) {
			ch.Receive(ctx, nil)
			stopped = true
		})
		selector.AddFuture(workflow.NewTimer(ctx, interval), func(_ workflow.Future) {})
		selector.Select(ctx)
		if stopped {
			return nil
		}
	}
}

func alertLevel(pct float64) string {
	switch {
	case pct >= 1.0:
		return "CRITICAL"
	case pct >= 0.90:
		return "HIGH"
	default:
		return "MEDIUM"
	}
}

const TopicLiquidityAlert = "nexthub.liquidity.alert.v1"

// ─── Collateral Deposit Workflow ──────────────────────────────────────────────

// CollateralDepositInput is the input for the CollateralDepositWorkflow.
type CollateralDepositInput struct {
	DepositID   string `json:"depositId"`
	DFSPID      string `json:"dfspId"`
	AmountKobo  int64  `json:"amountKobo"`
	Currency    string `json:"currency"`
	BankRef     string `json:"bankRef"`
}

// CollateralDepositWorkflow processes a collateral top-up:
//  1. Verify bank confirmation (activity)
//  2. Credit the DFSP's collateral account in TigerBeetle
//  3. Update the NDC limit in the DB
//  4. Publish a Kafka event
func CollateralDepositWorkflow(ctx workflow.Context, input CollateralDepositInput) (string, error) {
	ao := workflow.ActivityOptions{StartToCloseTimeout: 30 * time.Second}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: Verify bank confirmation
	var confirmed bool
	if err := workflow.ExecuteActivity(ctx, VerifyBankConfirmationActivity, input.BankRef, input.AmountKobo).Get(ctx, &confirmed); err != nil || !confirmed {
		return "UNCONFIRMED", nil
	}

	// Step 2: Credit collateral account in TigerBeetle
	var ledgerID uint64
	if err := workflow.ExecuteActivity(ctx, CreditCollateralActivity, input.DFSPID, input.AmountKobo, input.Currency).Get(ctx, &ledgerID); err != nil {
		return "FAILED", fmt.Errorf("credit collateral: %w", err)
	}

	// Step 3: Update NDC limit
	if err := workflow.ExecuteActivity(ctx, UpdateNDCLimitActivity, input.DFSPID, input.AmountKobo, input.Currency).Get(ctx, nil); err != nil {
		return "FAILED", fmt.Errorf("update NDC: %w", err)
	}

	// Step 4: Publish event
	_ = workflow.ExecuteActivity(ctx, PublishKafkaActivity, "nexthub.liquidity.collateral.deposited.v1", input.DepositID, map[string]any{
		"depositId":   input.DepositID,
		"dfspId":      input.DFSPID,
		"amountKobo":  input.AmountKobo,
		"currency":    input.Currency,
		"ledgerEntryId": ledgerID,
	})

	return "CONFIRMED", nil
}

// ─── Corridor Settlement Workflow ─────────────────────────────────────────────

// CorridorSettlementInput is the input for the CorridorSettlementWorkflow.
type CorridorSettlementInput struct {
	CorridorID   string `json:"corridorId"`
	WindowID     string `json:"windowId"`
	SourceCcy    string `json:"sourceCurrency"`
	TargetCcy    string `json:"targetCurrency"`
	FXRate       float64 `json:"fxRate"`
}

// CorridorSettlementWorkflow closes a multi-currency settlement corridor:
//  1. Collect all net positions in source currency
//  2. Convert to target currency using the provided FX rate
//  3. Commit multilateral net settlement in TigerBeetle
//  4. Publish settlement events
func CorridorSettlementWorkflow(ctx workflow.Context, input CorridorSettlementInput) (string, error) {
	ao := workflow.ActivityOptions{StartToCloseTimeout: 2 * time.Minute}
	ctx = workflow.WithActivityOptions(ctx, ao)

	var positions []NetPosition
	if err := workflow.ExecuteActivity(ctx, CollectCorridorPositionsActivity, input.CorridorID, input.WindowID).Get(ctx, &positions); err != nil {
		return "FAILED", err
	}

	for _, pos := range positions {
		convertedKobo := int64(float64(pos.NetKobo) * input.FXRate)
		if err := workflow.ExecuteActivity(ctx, SettleCorridorPositionActivity, pos.DFSPID, convertedKobo, input.TargetCcy, input.WindowID).Get(ctx, nil); err != nil {
			return "FAILED", fmt.Errorf("settle corridor position %s: %w", pos.DFSPID, err)
		}
	}

	_ = workflow.ExecuteActivity(ctx, PublishKafkaActivity, "nexthub.settlement.corridor.settled.v1", input.WindowID, map[string]any{
		"corridorId": input.CorridorID,
		"windowId":   input.WindowID,
		"sourceCcy":  input.SourceCcy,
		"targetCcy":  input.TargetCcy,
		"fxRate":     input.FXRate,
		"status":     "SETTLED",
	})

	return "SETTLED", nil
}

// ─── Activity implementations ─────────────────────────────────────────────────

func GetDFSPPositionActivity(ctx context.Context, dfspID, currency string) (int64, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("GetDFSPPositionActivity", "dfspId", dfspID, "currency", currency)
	// In production: query TigerBeetle for the DFSP's settlement account balance
	return 0, nil
}

func VerifyBankConfirmationActivity(ctx context.Context, bankRef string, amountKobo int64) (bool, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("VerifyBankConfirmationActivity", "bankRef", bankRef, "amount", amountKobo)
	// In production: call the bank's confirmation API
	return true, nil
}

func CreditCollateralActivity(ctx context.Context, dfspID string, amountKobo int64, currency string) (uint64, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("CreditCollateralActivity", "dfspId", dfspID, "amount", amountKobo)
	return uint64(time.Now().UnixNano()), nil
}

func UpdateNDCLimitActivity(ctx context.Context, dfspID string, deltaKobo int64, currency string) error {
	logger := activity.GetLogger(ctx)
	logger.Info("UpdateNDCLimitActivity", "dfspId", dfspID, "delta", deltaKobo)
	return nil
}

func CollectCorridorPositionsActivity(ctx context.Context, corridorID, windowID string) ([]NetPosition, error) {
	return []NetPosition{}, nil
}

func SettleCorridorPositionActivity(ctx context.Context, dfspID string, amountKobo int64, currency, windowID string) error {
	return nil
}
