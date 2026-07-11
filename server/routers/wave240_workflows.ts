/**
 * wave240_workflows.ts — Wave 240: Temporal Workflow Orchestration
 *
 * Provides tRPC procedures for:
 *  - Starting and querying Temporal workflows (Transfer, Payout, Dispute, Settlement, KYC)
 *  - Listing workflow instances with status
 *  - Cancelling / signalling running workflows
 *  - Workflow health dashboard
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { db } from "../db";
import { temporalWorkflowInstances } from "../../drizzle/nexthub_schema";
import { eq, desc, and } from "drizzle-orm";
import { safe } from "../middlewareBridge";

const WorkflowTypeEnum = z.enum([
  "TransferWorkflow",
  "PayoutApprovalWorkflow",
  "DisputeWorkflow",
  "SettlementWorkflow",
  "KYCWorkflow",
  "LiquidityMonitorWorkflow",
  "CollateralDepositWorkflow",
  "CorridorSettlementWorkflow",
]);

export const wave240Router = router({
  // ─── Start a workflow ────────────────────────────────────────────────────

  startWorkflow: protectedProcedure
    .input(z.object({
      workflowType: WorkflowTypeEnum,
      entityId: z.string(),
      entityType: z.string(),
      input: z.record(z.string(), z.any()),
    }))
    .mutation(async ({ input }) => {
      const workflowId = `${input.workflowType}-${input.entityId}-${Date.now()}`;

      // Try Go bridge (Temporal)
      const bridgeResult = await safe<{ workflowId: string; runId: string }>(
        "POST", "/v1/temporal/start",
        { workflowType: input.workflowType, workflowId, input: input.input }
      );

      const [instance] = await db
        .insert(temporalWorkflowInstances)
        .values({
          workflowId,
          runId: bridgeResult?.runId,
          workflowType: input.workflowType,
          status: "RUNNING",
          input: JSON.stringify(input.input),
          entityId: input.entityId,
          entityType: input.entityType,
        })
        .returning();

      return instance;
    }),

  // ─── List workflow instances ─────────────────────────────────────────────

  listWorkflows: protectedProcedure
    .input(z.object({
      workflowType: WorkflowTypeEnum.optional(),
      status: z.enum(["RUNNING", "COMPLETED", "FAILED", "CANCELLED"]).optional(),
      entityId: z.string().optional(),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const conditions = [];
      if (input.workflowType) conditions.push(eq(temporalWorkflowInstances.workflowType, input.workflowType));
      if (input.status) conditions.push(eq(temporalWorkflowInstances.status, input.status));
      if (input.entityId) conditions.push(eq(temporalWorkflowInstances.entityId, input.entityId));

      const rows = await db
        .select()
        .from(temporalWorkflowInstances)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(temporalWorkflowInstances.startedAt))
        .limit(input.limit)
        .offset(input.offset);

      return rows;
    }),

  // ─── Get a single workflow ────────────────────────────────────────────────

  getWorkflow: protectedProcedure
    .input(z.object({ workflowId: z.string() }))
    .query(async ({ input }) => {
      // Try bridge for live status
      const liveStatus = await safe<{ status: string; result?: unknown; errorMessage?: string }>(
        "GET", `/v1/temporal/status/${encodeURIComponent(input.workflowId)}`
      );

      const [instance] = await db
        .select()
        .from(temporalWorkflowInstances)
        .where(eq(temporalWorkflowInstances.workflowId, input.workflowId))
        .limit(1);

      if (!instance) return null;

      // Sync status from bridge if available
      if (liveStatus && liveStatus.status !== instance.status) {
        await db
          .update(temporalWorkflowInstances)
          .set({
            status: liveStatus.status,
            result: liveStatus.result ? JSON.stringify(liveStatus.result) : undefined,
            errorMessage: liveStatus.errorMessage,
            completedAt: ["COMPLETED", "FAILED", "CANCELLED"].includes(liveStatus.status) ? new Date() : undefined,
          })
          .where(eq(temporalWorkflowInstances.workflowId, input.workflowId));
      }

      return { ...instance, liveStatus };
    }),

  // ─── Cancel a workflow ────────────────────────────────────────────────────

  cancelWorkflow: protectedProcedure
    .input(z.object({ workflowId: z.string(), reason: z.string().optional() }))
    .mutation(async ({ input }) => {
      await safe("POST", "/v1/temporal/cancel", { workflowId: input.workflowId, reason: input.reason });

      const [updated] = await db
        .update(temporalWorkflowInstances)
        .set({ status: "CANCELLED", completedAt: new Date() })
        .where(eq(temporalWorkflowInstances.workflowId, input.workflowId))
        .returning();

      return updated;
    }),

  // ─── Send a signal to a workflow ─────────────────────────────────────────

  signalWorkflow: protectedProcedure
    .input(z.object({
      workflowId: z.string(),
      signalName: z.string(),
      payload: z.record(z.string(), z.any()).optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await safe("POST", "/v1/temporal/signal", {
        workflowId: input.workflowId,
        signalName: input.signalName,
        payload: input.payload,
      });
      return { signalled: Boolean(result), workflowId: input.workflowId };
    }),

  // ─── Dashboard stats ──────────────────────────────────────────────────────

  getDashboard: protectedProcedure.query(async () => {
    const all = await db.select().from(temporalWorkflowInstances);
    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    for (const w of all) {
      byType[w.workflowType] = (byType[w.workflowType] ?? 0) + 1;
      byStatus[w.status] = (byStatus[w.status] ?? 0) + 1;
    }

    return {
      total: all.length,
      running: byStatus["RUNNING"] ?? 0,
      completed: byStatus["COMPLETED"] ?? 0,
      failed: byStatus["FAILED"] ?? 0,
      cancelled: byStatus["CANCELLED"] ?? 0,
      byType,
    };
  }),
});
