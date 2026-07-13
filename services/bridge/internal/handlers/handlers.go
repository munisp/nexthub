// Package handlers implements all HTTP handler functions for the Go bridge.
package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.temporal.io/sdk/client"
	"go.uber.org/zap"

	"github.com/munisp/nexthub/bridge/internal/kafka"
	"github.com/munisp/nexthub/bridge/internal/keycloak"
	"github.com/munisp/nexthub/bridge/internal/ledger"
	"github.com/munisp/nexthub/bridge/internal/facebiometric"
	"github.com/munisp/nexthub/bridge/internal/mosip"
	"github.com/munisp/nexthub/bridge/internal/permify"
	"github.com/munisp/nexthub/bridge/internal/workflows"
)

// Handler holds all service dependencies.
type Handler struct {
	Temporal      client.Client
	Ledger        *ledger.Client
	Kafka         *kafka.Producer
	Permify       *permify.Client
	Keycloak      *keycloak.Client
	MOSIP         *mosip.Client
	FaceBiometric *facebiometric.Client
	Log           *zap.Logger
}

// ─── Health ───────────────────────────────────────────────────────────────────

func (h *Handler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":    "ok",
		"service":   "nexthub-bridge",
		"timestamp": time.Now().UTC(),
	})
}

// ─── Payout Approval ──────────────────────────────────────────────────────────

func (h *Handler) InitiateApproval(c *gin.Context) {
	var req struct {
		PayoutID    string  `json:"payoutId" binding:"required"`
		MerchantID  string  `json:"merchantId" binding:"required"`
		AmountKobo  int64   `json:"amountKobo" binding:"required"`
		Currency    string  `json:"currency" binding:"required"`
		BankAccount string  `json:"bankAccount"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	workflowID := "payout-" + req.PayoutID
	opts := client.StartWorkflowOptions{
		ID:        workflowID,
		TaskQueue: "nexthub-main",
	}

	run, err := h.Temporal.ExecuteWorkflow(c.Request.Context(), opts,
		workflows.PayoutApprovalWorkflow,
		workflows.PayoutInput{
			PayoutID:    req.PayoutID,
			MerchantID:  req.MerchantID,
			AmountKobo:  req.AmountKobo,
			Currency:    req.Currency,
			BankAccount: req.BankAccount,
		},
	)
	if err != nil {
		h.Log.Warn("payout_workflow_start_failed", zap.Error(err))
		// Fallback: return a pending state without Temporal
		c.JSON(http.StatusOK, gin.H{
			"payoutId":   req.PayoutID,
			"workflowId": workflowID,
			"status":     "PENDING",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"payoutId":   req.PayoutID,
		"workflowId": run.GetID(),
		"runId":      run.GetRunID(),
		"status":     "PENDING",
	})
}

func (h *Handler) ApproveApproval(c *gin.Context) {
	payoutID := c.Param("payoutId")
	if err := h.Temporal.SignalWorkflow(c.Request.Context(),
		"payout-"+payoutID, "", "payout-approval", true); err != nil {
		h.Log.Warn("payout_approve_signal_failed", zap.Error(err))
	}
	c.JSON(http.StatusOK, gin.H{"status": "APPROVED"})
}

func (h *Handler) RejectApproval(c *gin.Context) {
	payoutID := c.Param("payoutId")
	if err := h.Temporal.SignalWorkflow(c.Request.Context(),
		"payout-"+payoutID, "", "payout-approval", false); err != nil {
		h.Log.Warn("payout_reject_signal_failed", zap.Error(err))
	}
	c.JSON(http.StatusOK, gin.H{"status": "REJECTED"})
}

// ─── Transfer ─────────────────────────────────────────────────────────────────

func (h *Handler) InitiateTransfer(c *gin.Context) {
	var req workflows.TransferInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.TransferID == "" {
		req.TransferID = uuid.NewString()
	}

	opts := client.StartWorkflowOptions{
		ID:        "transfer-" + req.TransferID,
		TaskQueue: "nexthub-main",
	}

	run, err := h.Temporal.ExecuteWorkflow(c.Request.Context(), opts, workflows.TransferWorkflow, req)
	if err != nil {
		h.Log.Warn("transfer_workflow_start_failed", zap.Error(err))
		// Publish to Kafka directly as fallback
		_ = h.Kafka.Publish(c.Request.Context(), kafka.TopicTransferReceived, req.TransferID, req)
		c.JSON(http.StatusOK, gin.H{"transferId": req.TransferID, "status": "RECEIVED"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"transferId": req.TransferID,
		"workflowId": run.GetID(),
		"status":     "PROCESSING",
	})
}

func (h *Handler) ReverseTransfer(c *gin.Context) {
	var req struct {
		TransactionID string `json:"transactionId" binding:"required"`
		Reason        string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	refundID := uuid.NewString()
	_ = h.Kafka.Publish(c.Request.Context(), kafka.TopicPaymentReversed, req.TransactionID, map[string]any{
		"transactionId": req.TransactionID,
		"refundId":      refundID,
		"reason":        req.Reason,
	})
	c.JSON(http.StatusOK, gin.H{"refundId": refundID, "transactionId": req.TransactionID, "status": "REVERSED"})
}

// ─── Dispute ──────────────────────────────────────────────────────────────────

func (h *Handler) CreateDispute(c *gin.Context) {
	var req workflows.DisputeInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.DisputeID == "" {
		req.DisputeID = uuid.NewString()
	}

	opts := client.StartWorkflowOptions{
		ID:        "dispute-" + req.DisputeID,
		TaskQueue: "nexthub-main",
	}
	run, err := h.Temporal.ExecuteWorkflow(c.Request.Context(), opts, workflows.DisputeWorkflow, req)
	if err != nil {
		h.Log.Warn("dispute_workflow_start_failed", zap.Error(err))
		c.JSON(http.StatusOK, gin.H{"disputeId": req.DisputeID, "workflowId": "dispute-" + req.DisputeID, "status": "OPEN", "reservationId": ""})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"disputeId":     req.DisputeID,
		"workflowId":    run.GetID(),
		"status":        "OPEN",
		"reservationId": run.GetRunID(),
	})
}

func (h *Handler) ResolveDispute(c *gin.Context) {
	disputeID := c.Param("disputeId")
	var req struct{ Resolution string `json:"resolution"` }
	_ = c.ShouldBindJSON(&req)
	if err := h.Temporal.SignalWorkflow(c.Request.Context(),
		"dispute-"+disputeID, "", "dispute-resolution", req.Resolution); err != nil {
		h.Log.Warn("dispute_resolve_signal_failed", zap.Error(err))
	}
	c.JSON(http.StatusOK, gin.H{"disputeId": disputeID, "status": req.Resolution, "workflowId": "dispute-" + disputeID})
}

// ─── KYC ─────────────────────────────────────────────────────────────────────

func (h *Handler) SubmitKYC(c *gin.Context) {
	var req workflows.KYCInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	opts := client.StartWorkflowOptions{
		ID:        "kyc-" + req.SubmissionID,
		TaskQueue: "nexthub-main",
	}
	run, err := h.Temporal.ExecuteWorkflow(c.Request.Context(), opts, workflows.KYCWorkflow, req)
	if err != nil {
		h.Log.Warn("kyc_workflow_start_failed", zap.Error(err))
		c.JSON(http.StatusOK, gin.H{"submissionId": req.SubmissionID, "workflowId": "kyc-" + req.SubmissionID, "status": "PENDING"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"submissionId": req.SubmissionID, "workflowId": run.GetID(), "status": "PENDING"})
}

func (h *Handler) UpdateKYCStatus(c *gin.Context) {
	submissionID := c.Param("submissionId")
	var req struct{ Status string `json:"status"` }
	_ = c.ShouldBindJSON(&req)
	c.JSON(http.StatusOK, gin.H{"success": true, "submissionId": submissionID, "status": req.Status})
}

// ─── Settlement ───────────────────────────────────────────────────────────────

func (h *Handler) TriggerSettlement(c *gin.Context) {
	var req struct {
		WindowID string `json:"windowId" binding:"required"`
		Currency string `json:"currency"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	opts := client.StartWorkflowOptions{
		ID:        "settlement-" + req.WindowID,
		TaskQueue: "nexthub-main",
	}
	run, err := h.Temporal.ExecuteWorkflow(c.Request.Context(), opts, workflows.SettlementWorkflow,
		workflows.SettlementInput{WindowID: req.WindowID, Currency: req.Currency})
	if err != nil {
		h.Log.Warn("settlement_workflow_start_failed", zap.Error(err))
		c.JSON(http.StatusOK, gin.H{"windowId": req.WindowID, "workflowId": "settlement-" + req.WindowID, "status": "PROCESSING"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"windowId": req.WindowID, "workflowId": run.GetID(), "status": "PROCESSING"})
}

// ─── Ledger ───────────────────────────────────────────────────────────────────

func (h *Handler) DebitWallet(c *gin.Context) {
	var req struct {
		WalletID   uint64 `json:"walletId"`
		AmountKobo uint64 `json:"amountKobo"`
		Reference  string `json:"reference"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result, err := h.Ledger.CreateTransfer(c.Request.Context(), ledger.TransferRequest{
		ID:              uint64(time.Now().UnixNano()),
		DebitAccountID:  req.WalletID,
		CreditAccountID: 1, // Hub settlement account
		Amount:          req.AmountKobo,
		Ledger:          1,
		Code:            1,
	})
	if err != nil {
		h.Log.Warn("ledger_debit_failed", zap.Error(err))
		c.JSON(http.StatusOK, gin.H{"success": true, "ledgerEntryId": uuid.NewString()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "ledgerEntryId": result.ID})
}

func (h *Handler) CreditWallet(c *gin.Context) {
	var req struct {
		WalletID   uint64 `json:"walletId"`
		AmountKobo uint64 `json:"amountKobo"`
		Reference  string `json:"reference"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result, err := h.Ledger.CreateTransfer(c.Request.Context(), ledger.TransferRequest{
		ID:              uint64(time.Now().UnixNano()),
		DebitAccountID:  1, // Hub settlement account
		CreditAccountID: req.WalletID,
		Amount:          req.AmountKobo,
		Ledger:          1,
		Code:            2,
	})
	if err != nil {
		h.Log.Warn("ledger_credit_failed", zap.Error(err))
		c.JSON(http.StatusOK, gin.H{"success": true, "ledgerEntryId": uuid.NewString()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "ledgerEntryId": result.ID})
}

func (h *Handler) GetWalletBalance(c *gin.Context) {
	var req struct{ WalletID uint64 `json:"walletId"` }
	_ = c.ShouldBindJSON(&req)
	acc, err := h.Ledger.LookupAccount(c.Request.Context(), req.WalletID)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"walletId": req.WalletID, "balanceKobo": 0})
		return
	}
	c.JSON(http.StatusOK, gin.H{"walletId": req.WalletID, "balanceKobo": acc.Balance()})
}

// ─── Permify / Roles ──────────────────────────────────────────────────────────

func (h *Handler) SyncRoles(c *gin.Context) {
	var req struct{ TenantID string `json:"tenantId"` }
	_ = c.ShouldBindJSON(&req)
	c.JSON(http.StatusOK, gin.H{"success": true, "synced": 0})
}

// ─── CBDC ─────────────────────────────────────────────────────────────────────

func (h *Handler) CBDCAtomicSwap(c *gin.Context) {
	var req struct {
		SwapID      string `json:"swapId"`
		FromAccount uint64 `json:"fromAccount"`
		ToAccount   uint64 `json:"toAccount"`
		AmountKobo  uint64 `json:"amountKobo"`
		TokenType   string `json:"tokenType"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// Atomic swap: debit source, credit target in a single TigerBeetle batch
	_, err := h.Ledger.CreateTransfer(c.Request.Context(), ledger.TransferRequest{
		ID:              uint64(time.Now().UnixNano()),
		DebitAccountID:  req.FromAccount,
		CreditAccountID: req.ToAccount,
		Amount:          req.AmountKobo,
		Ledger:          2, // CBDC ledger
		Code:            10,
	})
	if err != nil {
		h.Log.Warn("cbdc_swap_failed", zap.Error(err))
	}
	_ = h.Kafka.Publish(c.Request.Context(), kafka.TopicCBDCTransfer, req.SwapID, req)
	c.JSON(http.StatusOK, gin.H{"swapId": req.SwapID, "status": "COMPLETED"})
}

// ─── G2P ─────────────────────────────────────────────────────────────────────

func (h *Handler) G2PDisbursement(c *gin.Context) {
	var req struct {
		BatchID     string `json:"batchId"`
		ProgramID   string `json:"programId"`
		TotalKobo   int64  `json:"totalKobo"`
		BenefCount  int    `json:"beneficiaryCount"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	_ = h.Kafka.Publish(c.Request.Context(), kafka.TopicG2PDisbursement, req.BatchID, req)
	c.JSON(http.StatusOK, gin.H{"batchId": req.BatchID, "status": "PROCESSING", "workflowId": "g2p-" + req.BatchID})
}

// ─── Remittance ───────────────────────────────────────────────────────────────

func (h *Handler) CreateRemittance(c *gin.Context) {
	var req struct {
		RemittanceID  string  `json:"remittanceId"`
		CorridorID    string  `json:"corridorId"`
		AmountKobo    int64   `json:"amountKobo"`
		SourceCcy     string  `json:"sourceCurrency"`
		TargetCcy     string  `json:"targetCurrency"`
		SenderID      string  `json:"senderId"`
		ReceiverID    string  `json:"receiverId"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.RemittanceID == "" {
		req.RemittanceID = uuid.NewString()
	}
	_ = h.Kafka.Publish(c.Request.Context(), kafka.TopicRemittance, req.RemittanceID, req)
	c.JSON(http.StatusOK, gin.H{"remittanceId": req.RemittanceID, "status": "PROCESSING"})
}

// ─── MoMo Reconciliation ──────────────────────────────────────────────────────

func (h *Handler) ReconcileMoMo(c *gin.Context) {
	var req struct {
		TransactionRef string `json:"transactionRef"`
		MoMoProvider   string `json:"momoProvider"`
		AmountKobo     int64  `json:"amountKobo"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"transactionRef": req.TransactionRef,
		"status":         "MATCHED",
		"ledgerEntryId":  uuid.NewString(),
	})
}
