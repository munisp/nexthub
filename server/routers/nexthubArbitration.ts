/**
 * nexthubArbitration.ts — Dispute Arbitration Tribunal tRPC Router
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides the full dispute arbitration lifecycle for the NextHub national
 * switch. Integrates with:
 *   - Temporal workflow engine (Go) for orchestration
 *   - Python ML scorer for fraud risk assessment
 *   - Kafka for event publishing
 *   - Redis for caching dispute state
 *
 * Roles:
 *   - Any DFSP operator can raise a dispute and submit evidence
 *   - Hub operators can review, decide, and close disputes
 *   - Regulators can view all disputes and export reports
 *
 * Language: TypeScript (tRPC v11)
 */
import { z } from "zod/v4";
import { router, protectedProcedure, hubOperatorProcedure } from "../_core/trpc";
import { db } from "../db";
import { logger } from "../logger";
import { cache, TTL } from "../cache";
import { publishKafkaEvent, NEXTHUB_KAFKA_TOPICS } from "../kafka/nexthubKafkaProducer";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { nexthubTransfers } from "../../drizzle/nexthub_schema";
import {
  disputeWorkflows,
  disputeEvidence,
  disputeDecisions,
  disputeChargebacks,
  disputeMlScores,
} from "../../drizzle/national_switch_schema";

const TEMPORAL_API_URL = process.env.TEMPORAL_API_URL ?? "http://temporal-frontend:7233";
const ML_SCORER_URL    = process.env.ML_SCORER_URL    ?? "http://dispute-ml-scorer:8230";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function startTemporalWorkflow(workflowId: string, input: Record<string, unknown>) {
  const res = await fetch(`${TEMPORAL_API_URL}/api/v1/namespaces/nexthub/workflows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workflowId,
      workflowType: { name: "DisputeArbitrationWorkflow" },
      taskQueue:    { name: "dispute-arbitration" },
      input:        { payloads: [{ data: Buffer.from(JSON.stringify(input)).toString("base64") }] },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Temporal error ${res.status}: ${body}`);
  }
  return res.json();
}

async function sendTemporalSignal(workflowId: string, signalName: string, input: unknown) {
  const res = await fetch(
    `${TEMPORAL_API_URL}/api/v1/namespaces/nexthub/workflows/${workflowId}/signal/${signalName}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { payloads: [{ data: Buffer.from(JSON.stringify(input)).toString("base64") }] },
      }),
    }
  );
  if (!res.ok) throw new Error(`Temporal signal error ${res.status}`);
}

async function getMLScore(disputeId: string, payload: Record<string, unknown>) {
  const res = await fetch(`${ML_SCORER_URL}/v1/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return null;
  return res.json() as Promise<{
    score: number;
    recommendation: string;
    confidence: number;
    fraud_indicators: string[];
  }>;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const nexthubArbitrationRouter = router({

  // ── Raise a dispute ─────────────────────────────────────────────────────────
  raiseDispute: protectedProcedure
    .input(z.object({
      transferId:    z.string().uuid(),
      reason:        z.enum([
        "UNAUTHORIZED_TRANSACTION",
        "DUPLICATE_TRANSACTION",
        "WRONG_AMOUNT",
        "WRONG_BENEFICIARY",
        "TECHNICAL_ERROR",
        "OTHER",
      ]),
      description:   z.string().min(10).max(2000),
      amountKobo:    z.number().int().positive().optional(),
      tenantId:      z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const database = await db;

      // Look up the transfer to get payer/payee DFSPs
      const [transfer] = await database.select().from(nexthubTransfers).where(eq(nexthubTransfers.id, input.transferId)).limit(1);
      if (!transfer) throw new Error("Transfer not found");

      const evidenceDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours
      const slaDeadline      = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days

      const workflowId = `dispute-${input.transferId}-${Date.now()}`;

      // Start Temporal workflow
      await startTemporalWorkflow(workflowId, {
        disputeId:        workflowId,
        transferId:       input.transferId,
        payerDfsp:        (transfer as any).payerFspId,
        payeeDfsp:        (transfer as any).payeeFspId,
        amount:           input.amountKobo ?? (transfer as any).amount,
        currency:         (transfer as any).currency ?? "NGN",
        reason:           input.reason,
        raisedBy:         ctx.user!.email,
        tenantId:         input.tenantId,
        evidenceDeadline: evidenceDeadline.toISOString(),
        slaDeadline:      slaDeadline.toISOString(),
      });

      await publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.DISPUTE_RAISED, {
        disputeId:   workflowId,
        transferId:  input.transferId,
        reason:      input.reason,
        raisedBy:    ctx.user!.email,
        timestamp:   new Date().toISOString(),
      });

      logger.info("arbitration.dispute_raised", {
        disputeId:  workflowId,
        transferId: input.transferId,
        reason:     input.reason,
        raisedBy:   ctx.user!.email,
      });

      return {
        disputeId:        workflowId,
        status:           "RAISED",
        evidenceDeadline: evidenceDeadline.toISOString(),
        slaDeadline:      slaDeadline.toISOString(),
      };
    }),

  // ── Submit evidence ─────────────────────────────────────────────────────────
  submitEvidence: protectedProcedure
    .input(z.object({
      disputeId:   z.string(),
      dfsp:        z.string(),
      evidenceUrl: z.string().url().optional(),
      notes:       z.string().min(5).max(5000),
    }))
    .mutation(async ({ input, ctx }) => {
      await sendTemporalSignal(
        input.disputeId,
        `evidence_submitted:${input.dfsp}`,
        {
          dfsp:        input.dfsp,
          evidenceUrl: input.evidenceUrl,
          notes:       input.notes,
          submittedAt: new Date().toISOString(),
          submittedBy: ctx.user!.email,
        }
      );

      logger.info("arbitration.evidence_submitted", {
        disputeId: input.disputeId,
        dfsp:      input.dfsp,
        by:        ctx.user!.email,
      });

      return { success: true };
    }),

  // ── Get ML score ─────────────────────────────────────────────────────────────
  getMlScore: hubOperatorProcedure
    .input(z.object({
      disputeId:   z.string(),
      transferId:  z.string().uuid(),
      amountKobo:  z.number().int().positive(),
      reason:      z.string(),
      payerDfsp:   z.string(),
      payeeDfsp:   z.string(),
      isCrossBorder: z.boolean().default(false),
    }))
    .query(async ({ input }) => {
      const cached = await cache.get("dispute:ml", input.disputeId);
      if (cached) return cached;

      const score = await getMLScore(input.disputeId, {
        dispute_id:    input.disputeId,
        transfer_id:   input.transferId,
        amount_kobo:   input.amountKobo,
        reason:        input.reason,
        payer_dfsp:    input.payerDfsp,
        payee_dfsp:    input.payeeDfsp,
        is_cross_border: input.isCrossBorder,
      });

      if (score) {
        await cache.set("dispute:ml", input.disputeId, score, 30);
      }

      return score;
    }),

  // ── Issue decision ───────────────────────────────────────────────────────────
  issueDecision: hubOperatorProcedure
    .input(z.object({
      disputeId:     z.string(),
      decision:      z.enum(["UPHOLD", "REJECT", "PARTIAL"]),
      chargebackAmount: z.number().int().positive().optional(),
      reasoning:     z.string().min(20).max(5000),
    }))
    .mutation(async ({ input, ctx }) => {
      await sendTemporalSignal(input.disputeId, "decision_issued", {
        arbitratorId:     ctx.user!.id.toString(),
        decision:         input.decision,
        amount:           input.chargebackAmount ?? 0,
        reasoning:        input.reasoning,
        decidedAt:        new Date().toISOString(),
      });

      await publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.DISPUTE_RAISED, {
        eventType:    "DECISION_ISSUED",
        disputeId:    input.disputeId,
        decision:     input.decision,
        decidedBy:    ctx.user!.email,
        timestamp:    new Date().toISOString(),
      });

      logger.info("arbitration.decision_issued", {
        disputeId:  input.disputeId,
        decision:   input.decision,
        decidedBy:  ctx.user!.email,
      });

      return { success: true };
    }),

  // ── File appeal ──────────────────────────────────────────────────────────────
  fileAppeal: protectedProcedure
    .input(z.object({
      disputeId: z.string(),
      grounds:   z.string().min(20).max(5000),
    }))
    .mutation(async ({ input, ctx }) => {
      await sendTemporalSignal(input.disputeId, "appeal_filed", {
        filedBy:  ctx.user!.email,
        grounds:  input.grounds,
        filedAt:  new Date().toISOString(),
      });

      logger.info("arbitration.appeal_filed", { disputeId: input.disputeId, by: ctx.user!.email });
      return { success: true };
    }),

  // ── Withdraw dispute ─────────────────────────────────────────────────────────
  withdraw: protectedProcedure
    .input(z.object({ disputeId: z.string(), reason: z.string().min(5) }))
    .mutation(async ({ input, ctx }) => {
      await sendTemporalSignal(input.disputeId, "withdrawn", {
        withdrawnBy: ctx.user!.email,
        reason:      input.reason,
        withdrawnAt: new Date().toISOString(),
      });

      logger.info("arbitration.withdrawn", { disputeId: input.disputeId, by: ctx.user!.email });
      return { success: true };
    }),

  // ── List disputes ────────────────────────────────────────────────────────────
  listDisputes: protectedProcedure
    .input(z.object({
      status:    z.string().optional(),
      dfspId:    z.string().optional(),
      fromDate:  z.string().optional(),
      toDate:    z.string().optional(),
      limit:     z.number().int().min(1).max(200).default(50),
      offset:    z.number().int().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const database = await db;
      // Query the transferDisputes table (existing schema)
      const conditions: any[] = [];
      if (input.status) conditions.push(sql`status = ${input.status}`);
      if (input.dfspId) conditions.push(sql`(payer_fsp_id = ${input.dfspId} OR payee_fsp_id = ${input.dfspId})`);
      if (input.fromDate) conditions.push(sql`created_at >= ${new Date(input.fromDate)}`);
      if (input.toDate) conditions.push(sql`created_at <= ${new Date(input.toDate)}`);

      const whereClause = conditions.length > 0
        ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
        : sql``;

      const disputes = await database.execute(
        sql`SELECT * FROM transfer_disputes ${whereClause} ORDER BY created_at DESC LIMIT ${input.limit} OFFSET ${input.offset}`
      );

      const [{ count }] = await database.execute(
        sql`SELECT COUNT(*) as count FROM transfer_disputes ${whereClause}`
      ) as unknown as Record<string, unknown>[];

      return { disputes: disputes.rows, total: Number(count), limit: input.limit, offset: input.offset };
    }),

  // ── Dispute statistics ───────────────────────────────────────────────────────
  statistics: hubOperatorProcedure
    .input(z.object({
      fromDate: z.string().optional(),
      toDate:   z.string().optional(),
    }))
    .query(async ({ input }) => {
      const database = await db;
      const stats = await database.execute(sql`
        SELECT
          status,
          COUNT(*) as count,
          SUM(amount) as total_amount,
          AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/3600) as avg_resolution_hours
        FROM transfer_disputes
        WHERE
          (${input.fromDate ?? null} IS NULL OR created_at >= ${input.fromDate ? new Date(input.fromDate) : null})
          AND (${input.toDate ?? null} IS NULL OR created_at <= ${input.toDate ? new Date(input.toDate) : null})
        GROUP BY status
        ORDER BY count DESC
      `);

      return stats.rows;
    }),
});
