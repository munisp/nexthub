/**
 * wave260_domains.ts — Wave 260: CBDC, G2P, Remittance, Healthcare & Audit Trail
 *
 * Provides tRPC procedures for:
 *  - CBDC account management and transfers
 *  - G2P disbursement batch processing
 *  - Remittance corridor management and transfers
 *  - Healthcare claim processing
 *  - Audit trail ingestion and query (synced to Python lakehouse)
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { db } from "../db";
import {
  cbdcAccounts,
  cbdcTransfers,
  g2pDisbursementBatches,
  remittanceCorridors,
  remittanceTransfers,
  healthcareClaims,
  auditTrailEvents,
} from "../../drizzle/nexthub_schema";
import { eq, desc, and } from "drizzle-orm";
import { safe } from "../middlewareBridge";
import { ENV } from "../_core/env";

// ─── Lakehouse helper ─────────────────────────────────────────────────────────

async function syncAuditToLakehouse(events: unknown[]) {
  try {
    const lakehouseUrl = ENV.lakehouseV2Url ?? "http://localhost:8000";
    await fetch(`${lakehouseUrl}/audit/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
    });
  } catch {
    // Non-fatal — audit is already in DB
  }
}

// ─── CBDC Router ──────────────────────────────────────────────────────────────

const cbdcRouter = router({
  listAccounts: protectedProcedure
    .input(z.object({ ownerId: z.string().optional(), limit: z.number().int().default(50) }))
    .query(async ({ input }) => {
      const q = db.select().from(cbdcAccounts).orderBy(desc(cbdcAccounts.createdAt)).limit(input.limit);
      if (input.ownerId) return q.where(eq(cbdcAccounts.ownerId, input.ownerId));
      return q;
    }),

  createAccount: protectedProcedure
    .input(z.object({
      ownerId: z.string(),
      ownerType: z.enum(["RETAIL", "WHOLESALE", "GOVERNMENT"]).default("RETAIL"),
      currency: z.string().default("eNGN"),
      rail: z.string().default("CBDC"),
      walletId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const bridgeResult = await safe<{ walletId: string }>("POST", "/v1/cbdc/accounts", input);
      const walletId = input.walletId ?? bridgeResult?.walletId ?? crypto.randomUUID();

      const [account] = await db
        .insert(cbdcAccounts)
        .values({
          id: crypto.randomUUID(),
          ownerId: input.ownerId,
          ownerType: input.ownerType,
          currency: input.currency,
          rail: input.rail,
          walletId,
          balance: 0,
          isActive: 1,
        })
        .returning();

      return account;
    }),

  transfer: protectedProcedure
    .input(z.object({
      senderWallet: z.string(),
      receiverWallet: z.string(),
      amount: z.number().positive(),
      currency: z.string().default("eNGN"),
      rail: z.string().default("CBDC"),
      narration: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const transferId = crypto.randomUUID();
      await safe("POST", "/v1/cbdc/transfers", { transferId, ...input });

      const [transfer] = await db
        .insert(cbdcTransfers)
        .values({
          id: transferId,
          rail: input.rail,
          senderWallet: input.senderWallet,
          receiverWallet: input.receiverWallet,
          amount: input.amount,
          currency: input.currency,
          narration: input.narration,
          status: "INITIATED",
        })
        .returning();

      await db.insert(auditTrailEvents).values({
        eventType: "CBDC_TRANSFER",
        actorId: input.senderWallet,
        actorType: "DFSP",
        resourceType: "cbdc_transfer",
        resourceId: transferId,
        action: "TRANSFER",
        outcome: "SUCCESS",
        metadata: JSON.stringify(input),
        lakehouseSynced: false,
      });

      return transfer;
    }),

  getTransferHistory: protectedProcedure
    .input(z.object({ wallet: z.string(), limit: z.number().int().default(50) }))
    .query(async ({ input }) => {
      return db
        .select()
        .from(cbdcTransfers)
        .where(eq(cbdcTransfers.senderWallet, input.wallet))
        .orderBy(desc(cbdcTransfers.createdAt))
        .limit(input.limit);
    }),

  getDashboard: protectedProcedure.query(async () => {
    const [accounts, transfers] = await Promise.all([
      db.select().from(cbdcAccounts),
      db.select().from(cbdcTransfers),
    ]);
    return {
      totalAccounts: accounts.length,
      activeAccounts: accounts.filter(a => a.isActive === 1).length,
      totalTransfers: transfers.length,
      completedTransfers: transfers.filter(t => t.status === "COMPLETED").length,
      pendingTransfers: transfers.filter(t => t.status === "INITIATED").length,
    };
  }),
});

// ─── G2P Router ───────────────────────────────────────────────────────────────

const g2pRouter = router({
  listBatches: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      limit: z.number().int().default(50),
    }))
    .query(async ({ input }) => {
      const q = db.select().from(g2pDisbursementBatches)
        .orderBy(desc(g2pDisbursementBatches.createdAt))
        .limit(input.limit);
      if (input.status) return q.where(eq(g2pDisbursementBatches.status, input.status));
      return q;
    }),

  createBatch: protectedProcedure
    .input(z.object({
      programType: z.string(),
      programId: z.string(),
      payerFsp: z.string(),
      payerAccount: z.string(),
      currency: z.string().default("NGN"),
      beneficiaryCount: z.number().int().positive(),
      totalAmount: z.number().positive(),
      amount: z.number().positive(),
      scheduledAt: z.string().optional(),
      createdBy: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const batchId = crypto.randomUUID();

      await safe("POST", "/v1/temporal/start", {
        workflowType: "G2PDisbursementWorkflow",
        workflowId: `G2PDisbursementWorkflow-${batchId}`,
        input: { batchId, ...input },
      });

      const [batch] = await db
        .insert(g2pDisbursementBatches)
        .values({
          id: batchId,
          programType: input.programType,
          programId: input.programId,
          payerFsp: input.payerFsp,
          payerAccount: input.payerAccount,
          currency: input.currency,
          beneficiaryCount: input.beneficiaryCount,
          totalAmount: input.totalAmount,
          amount: input.amount,
          disbursedCount: 0,
          failedCount: 0,
          status: "PENDING",
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
          createdBy: input.createdBy,
        })
        .returning();

      return batch;
    }),

  processBatch: protectedProcedure
    .input(z.object({ batchId: z.string() }))
    .mutation(async ({ input }) => {
      await safe("POST", "/v1/g2p/process", { batchId: input.batchId });

      const [updated] = await db
        .update(g2pDisbursementBatches)
        .set({ status: "PROCESSING" })
        .where(eq(g2pDisbursementBatches.id, input.batchId))
        .returning();

      return updated;
    }),

  getDashboard: protectedProcedure.query(async () => {
    const all = await db.select().from(g2pDisbursementBatches);
    return {
      total: all.length,
      pending: all.filter(b => b.status === "PENDING").length,
      processing: all.filter(b => b.status === "PROCESSING").length,
      completed: all.filter(b => b.status === "COMPLETED").length,
      failed: all.filter(b => b.status === "FAILED").length,
      totalDisbursedAmount: all.reduce((s, b) => s + (b.totalAmount ?? 0), 0),
    };
  }),
});

// ─── Remittance Router ────────────────────────────────────────────────────────

const remittanceRouter = router({
  listCorridors: protectedProcedure.query(async () => {
    return db.select().from(remittanceCorridors);
  }),

  upsertCorridor: protectedProcedure
    .input(z.object({
      fromCurrency: z.string().length(3),
      toCurrency: z.string().length(3),
      fromCountry: z.string(),
      toCountry: z.string(),
      exchangeRate: z.number().positive(),
      fee: z.number().min(0).default(0),
      provider: z.string(),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const [corridor] = await db
        .insert(remittanceCorridors)
        .values({
          fromCurrency: input.fromCurrency,
          toCurrency: input.toCurrency,
          fromCountry: input.fromCountry,
          toCountry: input.toCountry,
          exchangeRate: input.exchangeRate,
          fee: input.fee,
          provider: input.provider,
          isActive: input.isActive ? 1 : 0,
          feeType: "FLAT",
          minAmount: 100,
          maxAmount: 5_000_000,
        })
        .returning();
      return corridor;
    }),

  listTransfers: protectedProcedure
    .input(z.object({
      corridorId: z.string().optional(),
      status: z.string().optional(),
      limit: z.number().int().default(50),
    }))
    .query(async ({ input }) => {
      const conditions = [];
      if (input.corridorId) conditions.push(eq(remittanceTransfers.corridorId, input.corridorId));
      if (input.status) conditions.push(eq(remittanceTransfers.status, input.status));

      return db
        .select()
        .from(remittanceTransfers)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(remittanceTransfers.createdAt))
        .limit(input.limit);
    }),

  initiateTransfer: protectedProcedure
    .input(z.object({
      corridorId: z.string(),
      senderFsp: z.string(),
      senderAccount: z.string(),
      receiverFsp: z.string(),
      receiverAccount: z.string(),
      receiverName: z.string(),
      sendAmount: z.number().positive(),
      sendCurrency: z.string().length(3),
      narration: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const transferId = crypto.randomUUID();

      await safe("POST", "/v1/remittance/transfers", { transferId, ...input });

      const [transfer] = await db
        .insert(remittanceTransfers)
        .values({
          id: transferId,
          corridorId: input.corridorId,
          senderFsp: input.senderFsp,
          senderAccount: input.senderAccount,
          receiverFsp: input.receiverFsp,
          receiverAccount: input.receiverAccount,
          receiverName: input.receiverName,
          sendAmount: input.sendAmount,
          sendCurrency: input.sendCurrency,
          narration: input.narration,
          status: "INITIATED",
        })
        .returning();

      return transfer;
    }),
});

// ─── Healthcare Router ────────────────────────────────────────────────────────

const healthcareRouter = router({
  listClaims: protectedProcedure
    .input(z.object({
      providerId: z.string().optional(),
      status: z.string().optional(),
      limit: z.number().int().default(50),
    }))
    .query(async ({ input }) => {
      const conditions = [];
      if (input.providerId) conditions.push(eq(healthcareClaims.providerId, input.providerId));
      if (input.status) conditions.push(eq(healthcareClaims.status, input.status));

      return db
        .select()
        .from(healthcareClaims)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(healthcareClaims.submittedAt))
        .limit(input.limit);
    }),

  submitClaim: protectedProcedure
    .input(z.object({
      policyNumber: z.string(),
      beneficiaryId: z.string(),
      beneficiaryName: z.string(),
      providerId: z.string(),
      providerName: z.string(),
      claimType: z.string(),
      claimAmount: z.number().positive(),
      currency: z.string().default("NGN"),
      serviceDate: z.string(),
      diagnosisCodes: z.array(z.string()).default([]),
      procedureCodes: z.array(z.string()).default([]),
      submittedBy: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const claimId = crypto.randomUUID();

      await safe("POST", "/v1/healthcare/claims", { claimId, ...input });

      const [claim] = await db
        .insert(healthcareClaims)
        .values({
          id: claimId,
          policyNumber: input.policyNumber,
          beneficiaryId: input.beneficiaryId,
          beneficiaryName: input.beneficiaryName,
          providerId: input.providerId,
          providerName: input.providerName,
          claimType: input.claimType,
          claimAmount: input.claimAmount,
          currency: input.currency,
          serviceDate: input.serviceDate,
          diagnosisCodes: JSON.stringify(input.diagnosisCodes),
          procedureCodes: JSON.stringify(input.procedureCodes),
          status: "SUBMITTED",
          submittedBy: input.submittedBy,
        })
        .returning();

      return claim;
    }),

  processClaim: protectedProcedure
    .input(z.object({
      claimId: z.string(),
      decision: z.enum(["APPROVED", "REJECTED", "PARTIALLY_APPROVED"]),
      approvedAmount: z.number().optional(),
      adjudicationNotes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const [updated] = await db
        .update(healthcareClaims)
        .set({
          status: input.decision,
          approvedAmount: input.approvedAmount,
          adjudicationNotes: input.adjudicationNotes,
          adjudicatedAt: new Date(),
        })
        .where(eq(healthcareClaims.id, input.claimId))
        .returning();

      return updated;
    }),

  getDashboard: protectedProcedure.query(async () => {
    const all = await db.select().from(healthcareClaims);
    return {
      total: all.length,
      submitted: all.filter(c => c.status === "SUBMITTED").length,
      approved: all.filter(c => c.status === "APPROVED").length,
      rejected: all.filter(c => c.status === "REJECTED").length,
      totalClaimAmount: all.reduce((s, c) => s + c.claimAmount, 0),
      totalApprovedAmount: all.reduce((s, c) => s + (c.approvedAmount ?? 0), 0),
    };
  }),
});

// ─── Audit Trail Router ───────────────────────────────────────────────────────

const auditRouter = router({
  ingestEvents: protectedProcedure
    .input(z.object({
      events: z.array(z.object({
        eventType: z.string(),
        actorId: z.string(),
        actorType: z.string(),
        resourceType: z.string(),
        resourceId: z.string(),
        action: z.string(),
        outcome: z.enum(["SUCCESS", "FAILURE"]),
        metadata: z.record(z.any()).optional(),
        ipAddress: z.string().optional(),
        sessionId: z.string().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const rows = input.events.map(e => ({
        ...e,
        metadata: e.metadata ? JSON.stringify(e.metadata) : undefined,
        lakehouseSynced: false,
      }));

      await db.insert(auditTrailEvents).values(rows);
      await syncAuditToLakehouse(rows);

      return { ingested: rows.length };
    }),

  queryAudit: protectedProcedure
    .input(z.object({
      actorId: z.string().optional(),
      resourceType: z.string().optional(),
      resourceId: z.string().optional(),
      outcome: z.enum(["SUCCESS", "FAILURE"]).optional(),
      limit: z.number().int().min(1).max(500).default(100),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const conditions = [];
      if (input.actorId) conditions.push(eq(auditTrailEvents.actorId, input.actorId));
      if (input.resourceType) conditions.push(eq(auditTrailEvents.resourceType, input.resourceType));
      if (input.resourceId) conditions.push(eq(auditTrailEvents.resourceId, input.resourceId));
      if (input.outcome) conditions.push(eq(auditTrailEvents.outcome, input.outcome));

      return db
        .select()
        .from(auditTrailEvents)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(auditTrailEvents.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  getAuditStats: protectedProcedure.query(async () => {
    const all = await db.select().from(auditTrailEvents);
    const byOutcome: Record<string, number> = {};
    const byEventType: Record<string, number> = {};
    for (const e of all) {
      byOutcome[e.outcome] = (byOutcome[e.outcome] ?? 0) + 1;
      byEventType[e.eventType] = (byEventType[e.eventType] ?? 0) + 1;
    }
    return {
      total: all.length,
      synced: all.filter(e => e.lakehouseSynced).length,
      unsynced: all.filter(e => !e.lakehouseSynced).length,
      byOutcome,
      byEventType,
    };
  }),

  // Proxy to Python lakehouse for OLAP queries
  lakehouseQuery: protectedProcedure
    .input(z.object({ sql: z.string() }))
    .mutation(async ({ input }) => {
      const lakehouseUrl = ENV.lakehouseV2Url ?? "http://localhost:8000";
      const res = await fetch(`${lakehouseUrl}/analytics/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: input.sql }),
      });
      if (!res.ok) throw new Error(`Lakehouse returned ${res.status}`);
      return res.json();
    }),

  // Proxy to Python lakehouse for AML report
  runAmlReport: protectedProcedure
    .input(z.object({
      dfspId: z.string().optional(),
      fromDate: z.string().optional(),
      toDate: z.string().optional(),
      thresholdKobo: z.number().int().optional(),
    }))
    .mutation(async ({ input }) => {
      const lakehouseUrl = ENV.lakehouseV2Url ?? "http://localhost:8000";
      const res = await fetch(`${lakehouseUrl}/reports/aml`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dfsp_id: input.dfspId,
          from_date: input.fromDate,
          to_date: input.toDate,
          threshold_kobo: input.thresholdKobo,
        }),
      });
      if (!res.ok) throw new Error(`Lakehouse AML report failed: ${res.status}`);
      return res.json();
    }),
});

// ─── Exported router ─────────────────────────────────────────────────────────

export const wave260Router = router({
  cbdc:       cbdcRouter,
  g2p:        g2pRouter,
  remittance: remittanceRouter,
  healthcare: healthcareRouter,
  audit:      auditRouter,
});
