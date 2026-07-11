/**
 * wave250_liquidity.ts — Wave 250: Liquidity Cover Management
 *
 * Provides tRPC procedures for:
 *  - Collateral deposit processing (via Temporal workflow)
 *  - NDC limit management
 *  - Liquidity alert listing and resolution
 *  - Settlement corridor configuration
 *  - Liquidity monitor workflow control
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { db } from "../db";
import {
  collateralDeposits,
  liquidityAlerts,
  settlementCorridors,
  dfspNdcLimits,
  temporalWorkflowInstances,
} from "../../drizzle/nexthub_schema";
import { eq, desc, and, isNull } from "drizzle-orm";
import { safe } from "../middlewareBridge";
import { nexthubPublish } from "../kafka/nexthubKafkaProducer";

export const wave250Router = router({
  // ─── Collateral Deposits ─────────────────────────────────────────────────

  listCollateralDeposits: protectedProcedure
    .input(z.object({
      dfspId: z.string().optional(),
      status: z.enum(["PENDING", "CONFIRMED", "REJECTED"]).optional(),
      limit: z.number().int().min(1).max(200).default(50),
    }))
    .query(async ({ input }) => {
      const conditions = [];
      if (input.dfspId) conditions.push(eq(collateralDeposits.dfspId, input.dfspId));
      if (input.status) conditions.push(eq(collateralDeposits.status, input.status));

      return db
        .select()
        .from(collateralDeposits)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(collateralDeposits.createdAt))
        .limit(input.limit);
    }),

  initiateCollateralDeposit: protectedProcedure
    .input(z.object({
      dfspId: z.string(),
      amountKobo: z.number().int().positive(),
      currency: z.string().default("NGN"),
      bankRef: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const depositId = crypto.randomUUID();
      const workflowId = `CollateralDepositWorkflow-${depositId}`;

      // Start Temporal workflow via bridge
      const bridgeResult = await safe<{ workflowId: string; runId: string }>(
        "POST", "/v1/temporal/start",
        {
          workflowType: "CollateralDepositWorkflow",
          workflowId,
          input: {
            depositId,
            dfspId: input.dfspId,
            amountKobo: input.amountKobo,
            currency: input.currency,
            bankRef: input.bankRef ?? "",
          },
        }
      );

      const [deposit] = await db
        .insert(collateralDeposits)
        .values({
          id: depositId,
          dfspId: input.dfspId,
          amountKobo: input.amountKobo,
          currency: input.currency,
          bankRef: input.bankRef,
          status: "PENDING",
          workflowId,
        })
        .returning();

      // Track workflow instance
      if (bridgeResult) {
        await db.insert(temporalWorkflowInstances).values({
          workflowId,
          runId: bridgeResult.runId,
          workflowType: "CollateralDepositWorkflow",
          status: "RUNNING",
          entityId: depositId,
          entityType: "collateral_deposit",
          input: JSON.stringify(input),
        }).onConflictDoNothing();
      }

      return deposit;
    }),

  // ─── NDC Limit Management ─────────────────────────────────────────────────

  listNdcLimits: protectedProcedure.query(async () => {
    return db.select().from(dfspNdcLimits).orderBy(dfspNdcLimits.dfspName);
  }),

  updateNdcLimit: protectedProcedure
    .input(z.object({
      dfspId: z.string(),
      dfspName: z.string(),
      ndcLimitKobo: z.number().int().min(0),
      alertThresholdPct: z.number().min(50).max(100).default(80),
    }))
    .mutation(async ({ input }) => {
      // Sync to bridge
      await safe("POST", "/v1/liquidity/ndc/update", input);

      const [result] = await db
        .insert(dfspNdcLimits)
        .values({
          dfspId: input.dfspId,
          dfspName: input.dfspName,
          ndcLimitKobo: input.ndcLimitKobo,
          alertThresholdPct: input.alertThresholdPct,
        })
        .onConflictDoUpdate({
          target: dfspNdcLimits.dfspId,
          set: {
            ndcLimitKobo: input.ndcLimitKobo,
            alertThresholdPct: input.alertThresholdPct,
            updatedAt: new Date(),
          },
        })
        .returning();

      nexthubPublish.ndcLimitUpdated({
        dfspId: result.dfspId,
        dfspName: result.dfspName,
        limitType: "NDC",
        limitAmountKobo: result.ndcLimitKobo,
        currency: "NGN",
        timestamp: new Date().toISOString(),
      }).catch(() => {});
      return result;
    }),

  // ─── Liquidity Alerts ─────────────────────────────────────────────────────

  listLiquidityAlerts: protectedProcedure
    .input(z.object({
      dfspId: z.string().optional(),
      alertLevel: z.enum(["MEDIUM", "HIGH", "CRITICAL"]).optional(),
      unresolvedOnly: z.boolean().default(false),
      limit: z.number().int().min(1).max(200).default(50),
    }))
    .query(async ({ input }) => {
      const conditions = [];
      if (input.dfspId) conditions.push(eq(liquidityAlerts.dfspId, input.dfspId));
      if (input.alertLevel) conditions.push(eq(liquidityAlerts.alertLevel, input.alertLevel));
      if (input.unresolvedOnly) conditions.push(isNull(liquidityAlerts.resolvedAt));

      return db
        .select()
        .from(liquidityAlerts)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(liquidityAlerts.createdAt))
        .limit(input.limit);
    }),

  resolveLiquidityAlert: protectedProcedure
    .input(z.object({ alertId: z.string() }))
    .mutation(async ({ input }) => {
      const [updated] = await db
        .update(liquidityAlerts)
        .set({ resolvedAt: new Date() })
        .where(eq(liquidityAlerts.id, input.alertId))
        .returning();
      return updated;
    }),

  // ─── Settlement Corridors ─────────────────────────────────────────────────

  listCorridors: protectedProcedure.query(async () => {
    return db.select().from(settlementCorridors).orderBy(settlementCorridors.corridorId);
  }),

  upsertCorridor: protectedProcedure
    .input(z.object({
      corridorId: z.string(),
      sourceCurrency: z.string().length(3),
      targetCurrency: z.string().length(3),
      fxRate: z.number().positive(),
      status: z.enum(["ACTIVE", "SUSPENDED", "CLOSED"]).default("ACTIVE"),
    }))
    .mutation(async ({ input }) => {
      const [corridor] = await db
        .insert(settlementCorridors)
        .values(input)
        .onConflictDoUpdate({
          target: settlementCorridors.corridorId,
          set: {
            fxRate: input.fxRate,
            status: input.status,
            updatedAt: new Date(),
          },
        })
        .returning();
      return corridor;
    }),

  triggerCorridorSettlement: protectedProcedure
    .input(z.object({
      corridorId: z.string(),
      windowId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const [corridor] = await db
        .select()
        .from(settlementCorridors)
        .where(eq(settlementCorridors.corridorId, input.corridorId))
        .limit(1);

      if (!corridor) throw new Error(`Corridor ${input.corridorId} not found`);

      const workflowId = `CorridorSettlementWorkflow-${input.corridorId}-${input.windowId}`;

      await safe("POST", "/v1/temporal/start", {
        workflowType: "CorridorSettlementWorkflow",
        workflowId,
        input: {
          corridorId: input.corridorId,
          windowId: input.windowId,
          sourceCurrency: corridor.sourceCurrency,
          targetCurrency: corridor.targetCurrency,
          fxRate: corridor.fxRate,
        },
      });

      return { workflowId, status: "STARTED" };
    }),

  // ─── Liquidity Dashboard ──────────────────────────────────────────────────

  getDashboard: protectedProcedure.query(async () => {
    const [ndcLimits, pendingDeposits, unresolvedAlerts, corridors] = await Promise.all([
      db.select().from(dfspNdcLimits),
      db.select().from(collateralDeposits).where(eq(collateralDeposits.status, "PENDING")),
      db.select().from(liquidityAlerts).where(isNull(liquidityAlerts.resolvedAt)),
      db.select().from(settlementCorridors).where(eq(settlementCorridors.status, "ACTIVE")),
    ]);

    const criticalAlerts = unresolvedAlerts.filter(a => a.alertLevel === "CRITICAL");

    return {
      totalDfsps: ndcLimits.length,
      pendingDeposits: pendingDeposits.length,
      unresolvedAlerts: unresolvedAlerts.length,
      criticalAlerts: criticalAlerts.length,
      activeCorridors: corridors.length,
      totalNdcCapacityKobo: ndcLimits.reduce((s, n) => s + n.ndcLimitKobo, 0),
    };
  }),
});
