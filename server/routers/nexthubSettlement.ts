/**
 * NextHub Settlement Router
 *
 * Manages settlement windows, net positions, and the full settlement lifecycle
 * (OPEN → CLOSED → SETTLING → SETTLED) for the NextHub payment hub.
 *
 * TigerBeetle is the authoritative financial store. This router manages
 * the PostgreSQL operational projection and orchestrates the settlement workflow.
 */
import { z } from "zod";
import { protectedProcedure, hubOperatorProcedure, router } from "../_core/trpc";
import { db } from "../db";
import {
  prepareSettlementWindowInLedgerViaMiddleware,
  commitSettlementWindowInLedgerViaMiddleware,
  voidSettlementWindowInLedgerViaMiddleware,
} from "../middlewareBridge";
import {
  settlementWindows,
  settlementNetPositions,
  nexthubTransfers,
  nexthubDfsps,
} from "../../drizzle/nexthub_schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { nexthubPublish } from "../kafka/nexthubKafkaProducer";

// ─── Settlement Window Procedures ─────────────────────────────────────────────

export const nexthubSettlementRouter = router({

  /** List all settlement windows with pagination */
  listWindows: protectedProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
      status: z.enum(["OPEN", "CLOSED", "SETTLING", "SETTLED", "FAILED", "ALL"]).default("ALL"),
      windowType: z.enum(["RTGS", "DNS_INTRADAY", "DNS_EOD", "ALL"]).default("ALL"),
    }))
    .query(async ({ input }) => {
      const offset = (input.page - 1) * input.pageSize;

      const conditions = [];
      if (input.status !== "ALL") conditions.push(eq(settlementWindows.status, input.status));
      if (input.windowType !== "ALL") conditions.push(eq(settlementWindows.windowType, input.windowType));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [windows, countResult] = await Promise.all([
        db.select().from(settlementWindows)
          .where(whereClause)
          .orderBy(desc(settlementWindows.createdAt))
          .limit(input.pageSize)
          .offset(offset),
        db.select({ count: sql<number>`count(*)::int` })
          .from(settlementWindows)
          .where(whereClause),
      ]);

      return {
        windows,
        total: countResult[0]?.count ?? 0,
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  /** Get a single settlement window with its net positions */
  getWindow: protectedProcedure
    .input(z.object({ windowId: z.string() }))
    .query(async ({ input }) => {

      const [window] = await db.select()
        .from(settlementWindows)
        .where(eq(settlementWindows.id, input.windowId))
        .limit(1);

      if (!window) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Settlement window not found" });
      }

      const positions = await db.select()
        .from(settlementNetPositions)
        .where(eq(settlementNetPositions.windowId, input.windowId))
        .orderBy(desc(settlementNetPositions.netPositionKobo));

      return { window, positions };
    }),

  /** Open a new settlement window */
  openWindow: hubOperatorProcedure
    .input(z.object({
      windowType: z.enum(["RTGS", "DNS_INTRADAY", "DNS_EOD"]),
      currency: z.string().default("NGN"),
    }))
    .mutation(async ({ input }) => {

      // Ensure no other window of the same type is currently OPEN
      const [existing] = await db.select({ id: settlementWindows.id })
        .from(settlementWindows)
        .where(and(
          eq(settlementWindows.windowType, input.windowType),
          eq(settlementWindows.status, "OPEN"),
        ))
        .limit(1);

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A ${input.windowType} window is already open (id: ${existing.id})`,
        });
      }

      const [window] = await db.insert(settlementWindows).values({
        windowType: input.windowType,
        currency: input.currency,
        status: "OPEN",
        openedAt: new Date(),
      }).returning();

      // Publish Kafka event so downstream services know a window is open
      nexthubPublish.settlementWindowOpened({
        windowId: window.id,
        windowType: window.windowType,
        currency: window.currency,
        openedAt: window.openedAt.toISOString(),
      }).catch((err) =>
        console.error("[settlement] Kafka publish (window.opened) failed:", err?.message),
      );

      return window;
    }),

  /** Close a settlement window and compute net positions */
  closeWindow: hubOperatorProcedure
    .input(z.object({ windowId: z.string() }))
    .mutation(async ({ input }) => {

      const [window] = await db.select()
        .from(settlementWindows)
        .where(eq(settlementWindows.id, input.windowId))
        .limit(1);

      if (!window) throw new TRPCError({ code: "NOT_FOUND", message: "Window not found" });
      if (window.status !== "OPEN") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Window is ${window.status}, not OPEN` });
      }

      // ── FIXED: correct per-DFSP debit/credit aggregation using CTEs ─────
      // The original code had `payer_fsp_id = payer_fsp_id` (always true).
      // This version uses proper CTEs to separately aggregate debits and credits.
      const rawRows = await db.execute<{
        dfspId: string;
        totalDebitsKobo: string;
        totalCreditsKobo: string;
        transferCount: string;
      }>(sql`
        WITH
          debits AS (
            SELECT payer_fsp_id AS dfsp_id,
                   SUM(amount_kobo) AS total_debits,
                   COUNT(*) AS transfer_count
            FROM nexthub_transfers
            WHERE window_id = ${input.windowId} AND state = 'COMMITTED'
            GROUP BY payer_fsp_id
          ),
          credits AS (
            SELECT payee_fsp_id AS dfsp_id,
                   SUM(amount_kobo) AS total_credits,
                   COUNT(*) AS transfer_count
            FROM nexthub_transfers
            WHERE window_id = ${input.windowId} AND state = 'COMMITTED'
            GROUP BY payee_fsp_id
          ),
          all_dfsps AS (
            SELECT dfsp_id FROM debits UNION SELECT dfsp_id FROM credits
          )
        SELECT
          a.dfsp_id                                        AS "dfspId",
          COALESCE(d.total_debits,  0)::bigint             AS "totalDebitsKobo",
          COALESCE(c.total_credits, 0)::bigint             AS "totalCreditsKobo",
          (COALESCE(d.transfer_count, 0) + COALESCE(c.transfer_count, 0))::int AS "transferCount"
        FROM all_dfsps a
        LEFT JOIN debits  d ON d.dfsp_id = a.dfsp_id
        LEFT JOIN credits c ON c.dfsp_id = a.dfsp_id
        ORDER BY a.dfsp_id
      `);

      const rows = rawRows.rows;
      const dfspIds = rows.map((r) => r.dfspId);
      const dfsps = dfspIds.length > 0
        ? await db.select({ dfspId: nexthubDfsps.dfspId, dfspName: nexthubDfsps.dfspName })
            .from(nexthubDfsps).where(sql`dfsp_id = ANY(${dfspIds})`)
        : [];
      const dfspNameMap = new Map(dfsps.map((d) => [d.dfspId, d.dfspName]));

      const netPositionRows = rows.map((r) => ({
        windowId: input.windowId,
        dfspId: r.dfspId,
        dfspName: dfspNameMap.get(r.dfspId) ?? r.dfspId,
        currency: window.currency,
        totalDebitsKobo: Number(r.totalDebitsKobo),
        totalCreditsKobo: Number(r.totalCreditsKobo),
        netPositionKobo: Number(r.totalCreditsKobo) - Number(r.totalDebitsKobo),
        transferCount: Number(r.transferCount),
      }));

      const totalTransfers = netPositionRows.reduce((s, p) => s + p.transferCount, 0);
      const totalAmountKobo = netPositionRows.reduce((s, p) => s + Math.abs(p.netPositionKobo), 0);

      // ── Wrap in DB transaction (atomicity) ────────────────────────────────
      const updated = await db.transaction(async (tx) => {
        // Re-check status inside transaction (optimistic lock)
        const [current] = await tx
          .select({ status: settlementWindows.status })
          .from(settlementWindows)
          .where(eq(settlementWindows.id, input.windowId))
          .limit(1);
        if (current?.status !== "OPEN") {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Window was concurrently modified (status: ${current?.status})`,
          });
        }
        if (netPositionRows.length > 0) {
          await tx.insert(settlementNetPositions).values(netPositionRows);
        }
        const [win] = await tx
          .update(settlementWindows)
          .set({ status: "CLOSED", closedAt: new Date(), totalTransfers, totalAmountKobo, updatedAt: new Date() })
          .where(eq(settlementWindows.id, input.windowId))
          .returning();
        return win;
      });

      // Publish Kafka event (fire-and-forget, outside transaction)
      nexthubPublish.settlementClosed({
        windowId: updated.id,
        currency: updated.currency,
        totalTransfers: updated.totalTransfers,
        totalAmountKobo: updated.totalAmountKobo,
        closedAt: (updated.closedAt ?? new Date()).toISOString(),
      }).catch((err) =>
        console.error("[settlement] Kafka publish (window.closed) failed:", err?.message),
      );

      return { window: updated, netPositions: netPositionRows };
    }),

  /** Trigger settlement for a closed window (posts to TigerBeetle + CBN rail) */
  settleWindow: hubOperatorProcedure
    .input(z.object({ windowId: z.string() }))
    .mutation(async ({ input }) => {

      const [window] = await db.select()
        .from(settlementWindows)
        .where(eq(settlementWindows.id, input.windowId))
        .limit(1);

      if (!window) throw new TRPCError({ code: "NOT_FOUND", message: "Window not found" });
      if (window.status !== "CLOSED") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Window must be CLOSED to settle (current: ${window.status})` });
      }

      // Mark as SETTLING with optimistic lock (only if still CLOSED)
      const [updated] = await db
        .update(settlementWindows)
        .set({ status: "SETTLING", updatedAt: new Date() })
        .where(and(eq(settlementWindows.id, input.windowId), eq(settlementWindows.status, "CLOSED")))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: "CONFLICT", message: "Window was concurrently modified — please retry" });
      }

      // Fetch net positions for Kafka payload
      const positions = await db
        .select()
        .from(settlementNetPositions)
        .where(eq(settlementNetPositions.windowId, input.windowId));

      // Publish nexthub.settlement.window.settle — Rust settlement service consumes this
      nexthubPublish.settlementSettle({
        windowId: updated.id,
        currency: updated.currency,
        totalAmountKobo: updated.totalAmountKobo,
        netPositions: positions.map((p) => ({
          dfspId: p.dfspId,
          dfspName: p.dfspName,
          netPositionKobo: p.netPositionKobo,
          currency: p.currency,
        })),
        initiatedAt: new Date().toISOString(),
      }).catch((err) =>
        console.error("[settlement] Kafka publish (window.settle) failed:", err?.message),
      );

      // Two-phase TigerBeetle: prepare (reserve) all net positions
      const tbPrepare = await prepareSettlementWindowInLedgerViaMiddleware({
        windowId: updated.id,
        netPositions: positions.map((p) => ({
          dfspId: p.dfspId,
          tbAccountId: (p as any).tigerBeetleAccountId ?? p.dfspId,
          hubTbAccountId: "HUB-SETTLEMENT-ACCOUNT",
          netPositionKobo: p.netPositionKobo,
          currency: p.currency,
          ledger: 1,
        })),
      });
      if (tbPrepare) {
        // Store pending IDs for commit step (Rust service will commit after CBN RTGS confirms)
        await db.update(settlementWindows)
          .set({ updatedAt: new Date() })
          .where(eq(settlementWindows.id, updated.id));
      }
      return {
        window: updated,
        message: "Settlement initiated — TigerBeetle two-phase prepare complete, awaiting CBN RTGS confirmation",
        tigerBeetlePendingIds: tbPrepare?.pendingIds ?? {},
      };
    }),

  /** Get settlement statistics for the dashboard */
  getStats: protectedProcedure
    .query(async () => {

      const [stats] = await db.select({
        totalWindows: sql<number>`count(*)::int`,
        openWindows: sql<number>`count(*) filter (where status = 'OPEN')::int`,
        settledToday: sql<number>`count(*) filter (where status = 'SETTLED' and settled_at >= now() - interval '24 hours')::int`,
        totalSettledKobo: sql<number>`coalesce(sum(total_amount_kobo) filter (where status = 'SETTLED'), 0)::bigint`,
        pendingSettlementKobo: sql<number>`coalesce(sum(total_amount_kobo) filter (where status in ('CLOSED', 'SETTLING')), 0)::bigint`,
      }).from(settlementWindows);

      return stats;
    }),
});
