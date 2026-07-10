// Package temporal manages the Temporal worker that executes all NextHub workflows.
package temporal

import (
	"fmt"

	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/worker"
	"go.uber.org/zap"

	"github.com/munisp/nexthub/bridge/internal/workflows"
)

const TaskQueue = "nexthub-main"

// Worker wraps the Temporal client and worker.
type Worker struct {
	Client client.Client
	worker worker.Worker
	log    *zap.Logger
}

// NewWorker creates a Temporal client and registers all workflows and activities.
func NewWorker(hostPort, namespace string, log *zap.Logger) (*Worker, error) {
	c, err := client.Dial(client.Options{
		HostPort:  hostPort,
		Namespace: namespace,
	})
	if err != nil {
		return nil, fmt.Errorf("temporal dial: %w", err)
	}

	w := worker.New(c, TaskQueue, worker.Options{})

	// Register workflows
	w.RegisterWorkflow(workflows.TransferWorkflow)
	w.RegisterWorkflow(workflows.PayoutApprovalWorkflow)
	w.RegisterWorkflow(workflows.DisputeWorkflow)
	w.RegisterWorkflow(workflows.SettlementWorkflow)
	w.RegisterWorkflow(workflows.KYCWorkflow)
	w.RegisterWorkflow(workflows.LiquidityMonitorWorkflow)
	w.RegisterWorkflow(workflows.CollateralDepositWorkflow)
	w.RegisterWorkflow(workflows.CorridorSettlementWorkflow)

	// Register activities
	w.RegisterActivity(workflows.CheckNDCActivity)
	w.RegisterActivity(workflows.ReserveFundsActivity)
	w.RegisterActivity(workflows.CommitTransferActivity)
	w.RegisterActivity(workflows.VoidTransferActivity)
	w.RegisterActivity(workflows.PermifyCheckActivity)
	w.RegisterActivity(workflows.ReservePayoutActivity)
	w.RegisterActivity(workflows.CommitPayoutActivity)
	w.RegisterActivity(workflows.ReserveDisputeActivity)
	w.RegisterActivity(workflows.CommitDisputeRefundActivity)
	w.RegisterActivity(workflows.CollectNetPositionsActivity)
	w.RegisterActivity(workflows.SettlePositionActivity)
	w.RegisterActivity(workflows.RunKYCChecksActivity)
	w.RegisterActivity(workflows.PublishKafkaActivity)
	w.RegisterActivity(workflows.GetDFSPPositionActivity)
	w.RegisterActivity(workflows.VerifyBankConfirmationActivity)
	w.RegisterActivity(workflows.CreditCollateralActivity)
	w.RegisterActivity(workflows.UpdateNDCLimitActivity)
	w.RegisterActivity(workflows.CollectCorridorPositionsActivity)
	w.RegisterActivity(workflows.SettleCorridorPositionActivity)

	return &Worker{Client: c, worker: w, log: log}, nil
}

// Start begins polling the Temporal task queue (non-blocking).
func (w *Worker) Start() error {
	return w.worker.Start()
}

// Stop gracefully shuts down the worker.
func (w *Worker) Stop() {
	w.worker.Stop()
	w.Client.Close()
}
