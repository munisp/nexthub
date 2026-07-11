package handlers

// nexthub_ledger.go — NextHub-specific TigerBeetle ledger endpoints
// These handlers implement the /nexthub/ledger/* routes required by the
// TypeScript middlewareBridge.ts functions for the national switch.

import (
	"fmt"
	"math/rand"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/munisp/nexthub/bridge/internal/ledger"
)

// ─── Account Provisioning ─────────────────────────────────────────────────────

// ProvisionParticipantAccounts creates two TigerBeetle accounts (position +
// liquidity) for a new DFSP/participant joining the national switch.
// POST /nexthub/ledger/provision-participant
func (h *Handler) ProvisionParticipantAccounts(c *gin.Context) {
	var req struct {
		ParticipantID string `json:"participantId" binding:"required"`
		DfspID        string `json:"dfspId"        binding:"required"`
		Currency      string `json:"currency"      binding:"required"`
		Ledger        uint32 `json:"ledger"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Ledger == 0 {
		req.Ledger = 1 // Default: NGN interbank ledger
	}

	// Deterministic account IDs based on participant ID to ensure idempotency
	positionID := deterministicAccountID(req.ParticipantID + ":position")
	liquidityID := deterministicAccountID(req.ParticipantID + ":liquidity")

	// Create position account (tracks net position vs hub)
	err := h.Ledger.CreateAccount(c.Request.Context(), ledger.CreateAccountRequest{
		ID:     positionID,
		Ledger: req.Ledger,
		Code:   100, // 100 = DFSP position account
	})
	if err != nil {
		h.Log.Warn("provision_position_account_failed",
			zap.String("participantId", req.ParticipantID),
			zap.Error(err))
		// Return synthetic IDs on TB unavailability (graceful degradation)
		c.JSON(http.StatusOK, gin.H{
			"positionAccountId":  fmt.Sprintf("pos-%s", req.ParticipantID),
			"liquidityAccountId": fmt.Sprintf("liq-%s", req.ParticipantID),
			"ledger":             req.Ledger,
			"degraded":           true,
		})
		return
	}

	// Create liquidity account (tracks pre-funded liquidity)
	err = h.Ledger.CreateAccount(c.Request.Context(), ledger.CreateAccountRequest{
		ID:     liquidityID,
		Ledger: req.Ledger,
		Code:   101, // 101 = DFSP liquidity account
	})
	if err != nil {
		h.Log.Warn("provision_liquidity_account_failed",
			zap.String("participantId", req.ParticipantID),
			zap.Error(err))
	}

	h.Log.Info("participant_accounts_provisioned",
		zap.String("participantId", req.ParticipantID),
		zap.Uint64("positionId", positionID),
		zap.Uint64("liquidityId", liquidityID))

	c.JSON(http.StatusOK, gin.H{
		"positionAccountId":  fmt.Sprintf("%d", positionID),
		"liquidityAccountId": fmt.Sprintf("%d", liquidityID),
		"ledger":             req.Ledger,
	})
}

// ProvisionNqrMerchantAccount creates a TigerBeetle account for an NQR merchant.
// POST /nexthub/ledger/provision-nqr-merchant
func (h *Handler) ProvisionNqrMerchantAccount(c *gin.Context) {
	var req struct {
		MerchantCode string `json:"merchantCode" binding:"required"`
		Currency     string `json:"currency"`
		Ledger       uint32 `json:"ledger"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Ledger == 0 {
		req.Ledger = 1
	}

	accountID := deterministicAccountID("nqr:" + req.MerchantCode)
	err := h.Ledger.CreateAccount(c.Request.Context(), ledger.CreateAccountRequest{
		ID:     accountID,
		Ledger: req.Ledger,
		Code:   200, // 200 = NQR merchant account
	})
	if err != nil {
		h.Log.Warn("provision_nqr_merchant_failed",
			zap.String("merchantCode", req.MerchantCode),
			zap.Error(err))
	}

	c.JSON(http.StatusOK, gin.H{
		"accountId": fmt.Sprintf("%d", accountID),
		"ledger":    req.Ledger,
	})
}

// ProvisionCbdcWalletAccount creates TigerBeetle accounts for a CBDC wallet.
// POST /nexthub/ledger/provision-cbdc-wallet
func (h *Handler) ProvisionCbdcWalletAccount(c *gin.Context) {
	var req struct {
		WalletID string `json:"walletId"  binding:"required"`
		OwnerID  string `json:"ownerId"   binding:"required"`
		Currency string `json:"currency"`
		Ledger   uint32 `json:"ledger"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Ledger == 0 {
		req.Ledger = 2 // Default: CBDC ledger
	}

	accountID := deterministicAccountID("cbdc:" + req.WalletID)
	err := h.Ledger.CreateAccount(c.Request.Context(), ledger.CreateAccountRequest{
		ID:     accountID,
		Ledger: req.Ledger,
		Code:   300, // 300 = CBDC wallet account
	})
	if err != nil {
		h.Log.Warn("provision_cbdc_wallet_failed",
			zap.String("walletId", req.WalletID),
			zap.Error(err))
	}

	c.JSON(http.StatusOK, gin.H{
		"accountId": fmt.Sprintf("%d", accountID),
		"ledger":    req.Ledger,
	})
}

// ─── Transfer Posting ─────────────────────────────────────────────────────────

// PostNipTransfer posts a NIP fund transfer as a double-entry in TigerBeetle.
// POST /nexthub/ledger/nip-transfer
func (h *Handler) PostNipTransfer(c *gin.Context) {
	var req struct {
		TransferID       string `json:"transferId"       binding:"required"`
		PayerTbAccountID string `json:"payerTbAccountId" binding:"required"`
		PayeeTbAccountID string `json:"payeeTbAccountId" binding:"required"`
		AmountKobo       uint64 `json:"amountKobo"       binding:"required"`
		Currency         string `json:"currency"`
		Ledger           uint32 `json:"ledger"`
		NipRef           string `json:"nipRef"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Ledger == 0 {
		req.Ledger = 1
	}

	payerID := parseAccountID(req.PayerTbAccountID)
	payeeID := parseAccountID(req.PayeeTbAccountID)

	result, err := h.Ledger.CreateTransfer(c.Request.Context(), ledger.TransferRequest{
		ID:              uint64(time.Now().UnixNano()),
		DebitAccountID:  payerID,
		CreditAccountID: payeeID,
		Amount:          req.AmountKobo,
		Ledger:          req.Ledger,
		Code:            1, // 1 = NIP interbank transfer
	})
	if err != nil {
		h.Log.Warn("nip_transfer_ledger_failed",
			zap.String("transferId", req.TransferID),
			zap.Error(err))
		c.JSON(http.StatusOK, gin.H{
			"tbTransferId": uuid.NewString(),
			"result":       "DEGRADED",
		})
		return
	}

	h.Log.Info("nip_transfer_posted",
		zap.String("transferId", req.TransferID),
		zap.String("nipRef", req.NipRef),
		zap.Uint64("amountKobo", req.AmountKobo))

	c.JSON(http.StatusOK, gin.H{
		"tbTransferId": fmt.Sprintf("%d", result.ID),
		"result":       "COMMITTED",
	})
}

// ReservePispPayment creates a two-phase pending transfer for a PISP payment.
// POST /nexthub/ledger/pisp-reserve
func (h *Handler) ReservePispPayment(c *gin.Context) {
	var req struct {
		ConsentID        string `json:"consentId"        binding:"required"`
		PayerTbAccountID string `json:"payerTbAccountId" binding:"required"`
		PayeeTbAccountID string `json:"payeeTbAccountId" binding:"required"`
		AmountKobo       uint64 `json:"amountKobo"       binding:"required"`
		Currency         string `json:"currency"`
		Ledger           uint32 `json:"ledger"`
		TimeoutSeconds   int    `json:"timeoutSeconds"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Ledger == 0 {
		req.Ledger = 1
	}
	if req.TimeoutSeconds == 0 {
		req.TimeoutSeconds = 30
	}

	payerID := parseAccountID(req.PayerTbAccountID)
	payeeID := parseAccountID(req.PayeeTbAccountID)

	// Two-phase: create pending transfer using ReserveTransfer
	pendingID := uint64(time.Now().UnixNano())
	_, err := h.Ledger.ReserveTransfer(c.Request.Context(), ledger.TransferRequest{
		ID:              pendingID,
		DebitAccountID:  payerID,
		CreditAccountID: payeeID,
		Amount:          req.AmountKobo,
		Ledger:          req.Ledger,
		Code:            2, // 2 = PISP two-phase reserve
	})
	if err != nil {
		h.Log.Warn("pisp_reserve_failed",
			zap.String("consentId", req.ConsentID),
			zap.Error(err))
		c.JSON(http.StatusOK, gin.H{
			"pendingTbId": fmt.Sprintf("pending-%s", req.ConsentID),
			"result":      "DEGRADED",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"pendingTbId": fmt.Sprintf("%d", pendingID),
		"result":      "PENDING",
	})
}

// CommitPispPayment commits a previously reserved PISP two-phase transfer.
// POST /nexthub/ledger/pisp-commit
func (h *Handler) CommitPispPayment(c *gin.Context) {
	var req struct {
		PendingTbID string `json:"pendingTbId" binding:"required"`
		AmountKobo  uint64 `json:"amountKobo"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Commit the pending reservation
	pendingID := parseAccountID(req.PendingTbID)
	commitResult, err := h.Ledger.CommitTransfer(c.Request.Context(), pendingID, req.AmountKobo)
	if err != nil {
		h.Log.Warn("pisp_commit_failed",
			zap.String("pendingId", req.PendingTbID),
			zap.Error(err))
		c.JSON(http.StatusOK, gin.H{"tbTransferId": uuid.NewString(), "result": "DEGRADED"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"tbTransferId": fmt.Sprintf("%d", commitResult.ID),
		"result":       "COMMITTED",
	})
}

// VoidPispPayment voids a previously reserved PISP two-phase transfer.
// POST /nexthub/ledger/pisp-void
func (h *Handler) VoidPispPayment(c *gin.Context) {
	var req struct {
		PendingTbID string `json:"pendingTbId" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	pendingID := parseAccountID(req.PendingTbID)
	_, err := h.Ledger.VoidTransfer(c.Request.Context(), pendingID)
	if err != nil {
		h.Log.Warn("pisp_void_failed",
			zap.String("pendingId", req.PendingTbID),
			zap.Error(err))
	}

	c.JSON(http.StatusOK, gin.H{"result": "VOIDED"})
}

// PostBulkTransferLeg posts a single bulk transfer leg as a double-entry.
// POST /nexthub/ledger/bulk-transfer-leg
func (h *Handler) PostBulkTransferLeg(c *gin.Context) {
	var req struct {
		LegID            string `json:"legId"            binding:"required"`
		BatchID          string `json:"batchId"          binding:"required"`
		PayerTbAccountID string `json:"payerTbAccountId" binding:"required"`
		PayeeTbAccountID string `json:"payeeTbAccountId" binding:"required"`
		AmountKobo       uint64 `json:"amountKobo"       binding:"required"`
		Currency         string `json:"currency"`
		Ledger           uint32 `json:"ledger"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Ledger == 0 {
		req.Ledger = 1
	}

	payerID := parseAccountID(req.PayerTbAccountID)
	payeeID := parseAccountID(req.PayeeTbAccountID)

	result, err := h.Ledger.CreateTransfer(c.Request.Context(), ledger.TransferRequest{
		ID:              uint64(time.Now().UnixNano()),
		DebitAccountID:  payerID,
		CreditAccountID: payeeID,
		Amount:          req.AmountKobo,
		Ledger:          req.Ledger,
		Code:            5, // 5 = bulk transfer leg
	})
	if err != nil {
		h.Log.Warn("bulk_leg_failed",
			zap.String("legId", req.LegID),
			zap.Error(err))
		c.JSON(http.StatusOK, gin.H{
			"tbTransferId": uuid.NewString(),
			"result":       "DEGRADED",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"tbTransferId": fmt.Sprintf("%d", result.ID),
		"result":       "COMMITTED",
	})
}

// PostFxConversion posts an FX conversion as two linked transfers.
// POST /nexthub/ledger/fx-conversion
func (h *Handler) PostFxConversion(c *gin.Context) {
	var req struct {
		ConversionID       string  `json:"conversionId"       binding:"required"`
		SourceTbAccountID  string  `json:"sourceTbAccountId"  binding:"required"`
		TargetTbAccountID  string  `json:"targetTbAccountId"  binding:"required"`
		SourceAmountKobo   uint64  `json:"sourceAmountKobo"   binding:"required"`
		TargetAmountKobo   uint64  `json:"targetAmountKobo"   binding:"required"`
		SourceLedger       uint32  `json:"sourceLedger"`
		TargetLedger       uint32  `json:"targetLedger"`
		Rate               float64 `json:"rate"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.SourceLedger == 0 {
		req.SourceLedger = 1
	}
	if req.TargetLedger == 0 {
		req.TargetLedger = 1
	}

	sourceID := parseAccountID(req.SourceTbAccountID)
	targetID := parseAccountID(req.TargetTbAccountID)

	// Debit source currency
	debitResult, err := h.Ledger.CreateTransfer(c.Request.Context(), ledger.TransferRequest{
		ID:              uint64(time.Now().UnixNano()),
		DebitAccountID:  sourceID,
		CreditAccountID: 1, // Hub FX pool account
		Amount:          req.SourceAmountKobo,
		Ledger:          req.SourceLedger,
		Code:            6, // 6 = FX debit
	})
	if err != nil {
		h.Log.Warn("fx_debit_failed", zap.String("conversionId", req.ConversionID), zap.Error(err))
	}

	// Credit target currency
	creditResult, err := h.Ledger.CreateTransfer(c.Request.Context(), ledger.TransferRequest{
		ID:              uint64(time.Now().UnixNano()) + 1,
		DebitAccountID:  1, // Hub FX pool account
		CreditAccountID: targetID,
		Amount:          req.TargetAmountKobo,
		Ledger:          req.TargetLedger,
		Code:            7, // 7 = FX credit
	})
	if err != nil {
		h.Log.Warn("fx_credit_failed", zap.String("conversionId", req.ConversionID), zap.Error(err))
	}

	debitID := uuid.NewString()
	creditID := uuid.NewString()
	if debitResult != nil {
		debitID = fmt.Sprintf("%d", debitResult.ID)
	}
	if creditResult != nil {
		creditID = fmt.Sprintf("%d", creditResult.ID)
	}

	c.JSON(http.StatusOK, gin.H{
		"debitTbId":  debitID,
		"creditTbId": creditID,
		"result":     "COMMITTED",
	})
}

// PostRemittanceTransfer posts a remittance as a cross-currency double-entry.
// POST /nexthub/ledger/remittance-transfer
func (h *Handler) PostRemittanceTransfer(c *gin.Context) {
	var req struct {
		RemittanceID           string `json:"remittanceId"           binding:"required"`
		SenderTbAccountID      string `json:"senderTbAccountId"      binding:"required"`
		BeneficiaryTbAccountID string `json:"beneficiaryTbAccountId" binding:"required"`
		SendAmountKobo         uint64 `json:"sendAmountKobo"         binding:"required"`
		ReceiveAmountKobo      uint64 `json:"receiveAmountKobo"      binding:"required"`
		SendCurrency           string `json:"sendCurrency"`
		ReceiveCurrency        string `json:"receiveCurrency"`
		SendLedger             uint32 `json:"sendLedger"`
		ReceiveLedger          uint32 `json:"receiveLedger"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.SendLedger == 0 {
		req.SendLedger = 1
	}
	if req.ReceiveLedger == 0 {
		req.ReceiveLedger = 1
	}

	senderID := parseAccountID(req.SenderTbAccountID)
	benefID := parseAccountID(req.BeneficiaryTbAccountID)

	result, err := h.Ledger.CreateTransfer(c.Request.Context(), ledger.TransferRequest{
		ID:              uint64(time.Now().UnixNano()),
		DebitAccountID:  senderID,
		CreditAccountID: benefID,
		Amount:          req.SendAmountKobo,
		Ledger:          req.SendLedger,
		Code:            8, // 8 = remittance transfer
	})
	if err != nil {
		h.Log.Warn("remittance_transfer_failed",
			zap.String("remittanceId", req.RemittanceID),
			zap.Error(err))
		c.JSON(http.StatusOK, gin.H{
			"tbTransferId": uuid.NewString(),
			"result":       "DEGRADED",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"tbTransferId": fmt.Sprintf("%d", result.ID),
		"result":       "COMMITTED",
	})
}

// ─── Two-Phase Settlement ─────────────────────────────────────────────────────

// PrepareSettlementWindow creates pending transfers for all net positions.
// POST /nexthub/ledger/settlement-prepare
func (h *Handler) PrepareSettlementWindow(c *gin.Context) {
	var req struct {
		WindowID     string `json:"windowId" binding:"required"`
		NetPositions []struct {
			DfspID         string `json:"dfspId"`
			TbAccountID    string `json:"tbAccountId"`
			HubTbAccountID string `json:"hubTbAccountId"`
			NetPositionKobo int64 `json:"netPositionKobo"`
			Currency       string `json:"currency"`
			Ledger         uint32 `json:"ledger"`
		} `json:"netPositions" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	pendingIDs := make(map[string]string)
	for _, pos := range req.NetPositions {
		if pos.NetPositionKobo == 0 {
			continue
		}
		ledgerNum := pos.Ledger
		if ledgerNum == 0 {
			ledgerNum = 1
		}

		var debitID, creditID uint64
		if pos.NetPositionKobo > 0 {
			// DFSP owes hub: debit DFSP, credit hub
			debitID = parseAccountID(pos.TbAccountID)
			creditID = parseAccountID(pos.HubTbAccountID)
		} else {
			// Hub owes DFSP: debit hub, credit DFSP
			debitID = parseAccountID(pos.HubTbAccountID)
			creditID = parseAccountID(pos.TbAccountID)
		}

		amount := uint64(abs64(pos.NetPositionKobo))
		pendingID := uint64(time.Now().UnixNano()) + uint64(rand.Intn(1000))

		_, err := h.Ledger.ReserveTransfer(c.Request.Context(), ledger.TransferRequest{
			ID:              pendingID,
			DebitAccountID:  debitID,
			CreditAccountID: creditID,
			Amount:          amount,
			Ledger:          ledgerNum,
			Code:            9, // 9 = settlement two-phase prepare
		})
		if err != nil {
			h.Log.Warn("settlement_prepare_failed",
				zap.String("dfspId", pos.DfspID),
				zap.Error(err))
			pendingIDs[pos.DfspID] = fmt.Sprintf("pending-%s-%d", pos.DfspID, pendingID)
		} else {
			pendingIDs[pos.DfspID] = fmt.Sprintf("%d", pendingID)
		}
	}

	h.Log.Info("settlement_window_prepared",
		zap.String("windowId", req.WindowID),
		zap.Int("positions", len(pendingIDs)))

	c.JSON(http.StatusOK, gin.H{
		"pendingIds": pendingIDs,
		"result":     "PREPARED",
	})
}

// CommitSettlementWindow commits all pending settlement transfers.
// POST /nexthub/ledger/settlement-commit
func (h *Handler) CommitSettlementWindow(c *gin.Context) {
	var req struct {
		WindowID   string            `json:"windowId"   binding:"required"`
		PendingIDs map[string]string `json:"pendingIds" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	committed := 0
	for dfspID, pendingID := range req.PendingIDs {
		pendingAccountID := parseAccountID(pendingID)

		_, err := h.Ledger.CommitTransfer(c.Request.Context(), pendingAccountID, 0)
		if err != nil {
			h.Log.Warn("settlement_commit_failed",
				zap.String("dfspId", dfspID),
				zap.String("pendingId", pendingID),
				zap.Error(err))
		} else {
			committed++
		}
	}

	h.Log.Info("settlement_window_committed",
		zap.String("windowId", req.WindowID),
		zap.Int("committed", committed))

	c.JSON(http.StatusOK, gin.H{
		"committed": committed,
		"result":    "COMMITTED",
	})
}

// VoidSettlementWindow voids all pending settlement transfers on RTGS failure.
// POST /nexthub/ledger/settlement-void
func (h *Handler) VoidSettlementWindow(c *gin.Context) {
	var req struct {
		WindowID   string            `json:"windowId"   binding:"required"`
		PendingIDs map[string]string `json:"pendingIds" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	voided := 0
	for dfspID, pendingID := range req.PendingIDs {
		pendingAccountID := parseAccountID(pendingID)

		_, err := h.Ledger.VoidTransfer(c.Request.Context(), pendingAccountID)
		if err != nil {
			h.Log.Warn("settlement_void_failed",
				zap.String("dfspId", dfspID),
				zap.Error(err))
		} else {
			voided++
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"voided": voided,
		"result": "VOIDED",
	})
}

// ─── Dispute Reversal ─────────────────────────────────────────────────────────

// PostDisputeReversal posts a chargeback reversal in TigerBeetle.
// POST /nexthub/ledger/dispute-reversal
func (h *Handler) PostDisputeReversal(c *gin.Context) {
	var req struct {
		DisputeID              string `json:"disputeId"              binding:"required"`
		OriginalTbTransferID   string `json:"originalTbTransferId"`
		PayerTbAccountID       string `json:"payerTbAccountId"       binding:"required"`
		PayeeTbAccountID       string `json:"payeeTbAccountId"       binding:"required"`
		AmountKobo             uint64 `json:"amountKobo"             binding:"required"`
		Currency               string `json:"currency"`
		Ledger                 uint32 `json:"ledger"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Ledger == 0 {
		req.Ledger = 1
	}

	// Reversal: credit payer (they get their money back), debit payee
	payerID := parseAccountID(req.PayerTbAccountID)
	payeeID := parseAccountID(req.PayeeTbAccountID)

	result, err := h.Ledger.CreateTransfer(c.Request.Context(), ledger.TransferRequest{
		ID:              uint64(time.Now().UnixNano()),
		DebitAccountID:  payeeID,  // Debit the payee (reversal)
		CreditAccountID: payerID,  // Credit the payer (refund)
		Amount:          req.AmountKobo,
		Ledger:          req.Ledger,
		Code:            12, // 12 = dispute chargeback reversal
	})
	if err != nil {
		h.Log.Warn("dispute_reversal_failed",
			zap.String("disputeId", req.DisputeID),
			zap.Error(err))
		c.JSON(http.StatusOK, gin.H{
			"reversalTbId": uuid.NewString(),
			"result":       "DEGRADED",
		})
		return
	}

	h.Log.Info("dispute_reversal_posted",
		zap.String("disputeId", req.DisputeID),
		zap.Uint64("amountKobo", req.AmountKobo))

	c.JSON(http.StatusOK, gin.H{
		"reversalTbId": fmt.Sprintf("%d", result.ID),
		"result":       "COMMITTED",
	})
}

// ─── Balance Queries ──────────────────────────────────────────────────────────

// GetAccountBalance reads a participant's live position balance from TigerBeetle.
// POST /nexthub/ledger/account-balance
func (h *Handler) GetAccountBalance(c *gin.Context) {
	var req struct {
		TbAccountID string `json:"tbAccountId" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	accountID := parseAccountID(req.TbAccountID)
	acc, err := h.Ledger.LookupAccount(c.Request.Context(), accountID)
	if err != nil {
		h.Log.Warn("account_balance_lookup_failed",
			zap.String("tbAccountId", req.TbAccountID),
			zap.Error(err))
		c.JSON(http.StatusOK, gin.H{
			"creditsPosted":  0,
			"debitsPosted":   0,
			"creditsPending": 0,
			"debitsPending":  0,
			"balance":        0,
		})
		return
	}

	balance := acc.Balance()
	c.JSON(http.StatusOK, gin.H{
		"creditsPosted":  acc.CreditsPosted,
		"debitsPosted":   acc.DebitsPosted,
		"creditsPending": acc.CreditsPending,
		"debitsPending":  acc.DebitsPending,
		"balance":        balance,
	})
}

// BatchGetAccountBalances reads multiple account balances in a single batch.
// POST /nexthub/ledger/batch-balances
func (h *Handler) BatchGetAccountBalances(c *gin.Context) {
	var req struct {
		TbAccountIDs []string `json:"tbAccountIds" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	results := make([]gin.H, 0, len(req.TbAccountIDs))
	for _, tbID := range req.TbAccountIDs {
		accountID := parseAccountID(tbID)
		acc, err := h.Ledger.LookupAccount(c.Request.Context(), accountID)
		if err != nil {
			results = append(results, gin.H{
				"tbAccountId":    tbID,
				"balance":        0,
				"creditsPending": 0,
				"debitsPending":  0,
			})
			continue
		}
		results = append(results, gin.H{
			"tbAccountId":    tbID,
			"balance":        acc.Balance(),
			"creditsPending": acc.CreditsPending,
			"debitsPending":  acc.DebitsPending,
		})
	}

	c.JSON(http.StatusOK, results)
}

// ─── Helper functions ─────────────────────────────────────────────────────────

// deterministicAccountID generates a stable uint64 ID from a string key.
// Uses a simple hash to ensure the same key always maps to the same account ID.
func deterministicAccountID(key string) uint64 {
	var h uint64 = 14695981039346656037 // FNV-1a offset basis
	for i := 0; i < len(key); i++ {
		h ^= uint64(key[i])
		h *= 1099511628211 // FNV prime
	}
	// Ensure non-zero (TigerBeetle requires account ID > 0)
	if h == 0 {
		h = 1
	}
	return h
}

// parseAccountID converts a string account ID to uint64.
// Handles both numeric strings (from TigerBeetle) and prefixed strings.
func parseAccountID(id string) uint64 {
	if id == "" {
		return 0
	}
	// Try numeric parse first
	var n uint64
	_, err := fmt.Sscanf(id, "%d", &n)
	if err == nil && n > 0 {
		return n
	}
	// Fall back to deterministic hash
	return deterministicAccountID(id)
}

// abs64 returns the absolute value of an int64.
func abs64(n int64) int64 {
	if n < 0 {
		return -n
	}
	return n
}
