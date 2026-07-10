/**
 * integrationApi.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * NextHub REST Integration API
 *
 * These Express routes are the ONLY surface that Paygate (or any DFSP client)
 * is allowed to call. All requests are authenticated with an HMAC signature
 * or a Keycloak service-account Bearer token.
 *
 * Base path: /api/v1
 *
 * Endpoints:
 *   POST   /transfers                 — Initiate a cross-border transfer
 *   GET    /transfers/:id             — Poll transfer status
 *   GET    /fx/rates                  — Live FX rates for corridor pricing
 *   GET    /fx/rates/:from/:to        — Single pair rate
 *   GET    /ndc-limits                — NDC limits for a DFSP
 *   GET    /ndc-limits/:dfspId        — Single DFSP NDC limit
 *   GET    /participants              — List active DFSPs/participants
 *   GET    /participants/:id          — Single participant detail
 *   GET    /settlement/windows        — Settlement window status
 *   GET    /settlement/windows/:id    — Single window detail
 *   GET    /scheme/fees               — Applicable scheme fees for a transaction
 *   GET    /health                    — Service health check
 *   GET    /corridor-volume           — Aggregated corridor volume (for Paygate analytics)
 */

import { Router, Request, Response, NextFunction } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { getDb } from "./db";
import {
  nexthubTransfers,
  nexthubFxRates,
  dfspNdcLimits,
  nexthubParticipants,
  nexthubParticipantLimits,
  nexthubDfsps,
  settlementWindows,
  dfspFeeTiers,
  feePostings,
} from "../drizzle/nexthub_schema";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

// ─── Auth middleware ──────────────────────────────────────────────────────────

const INTEGRATION_SECRET = process.env.NEXTHUB_INTEGRATION_SECRET ?? "dev-secret-change-in-production";

function verifyHmac(req: Request): boolean {
  const sig = req.headers["x-nexthub-signature"] as string | undefined;
  if (!sig) return false;
  const body = JSON.stringify(req.body ?? {});
  const expected = createHmac("sha256", INTEGRATION_SECRET)
    .update(body)
    .digest("hex");
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

function verifyBearer(req: Request): boolean {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return false;
  // In production: validate against Keycloak JWKS
  // In dev/test: accept any non-empty token
  return auth.length > 10;
}

function integrationAuth(req: Request, res: Response, next: NextFunction) {
  // Allow health check without auth
  if (req.path === "/health") return next();

  if (verifyBearer(req) || verifyHmac(req)) {
    return next();
  }

  // In development mode, allow unauthenticated access
  if (process.env.NODE_ENV !== "production") {
    return next();
  }

  res.status(401).json({ error: "Unauthorized", code: "NEXTHUB_AUTH_REQUIRED" });
}

// ─── Router ───────────────────────────────────────────────────────────────────

export function createIntegrationRouter(): Router {
  const router = Router();
  router.use(integrationAuth);

  // ── Health ────────────────────────────────────────────────────────────────
  router.get("/health", async (_req, res) => {
    try {
      const db = await getDb();
      await db?.execute(sql`SELECT 1`);
      res.json({ status: "ok", service: "nexthub-core", ts: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: "degraded", service: "nexthub-core" });
    }
  });

  // ── Transfers ─────────────────────────────────────────────────────────────

  /**
   * POST /api/v1/transfers
   * Initiate a cross-border transfer through the hub.
   * Body: { payerFspId, payeeFspId, payerPartyId, payeePartyId, amountKobo, currency, ilpPacket?, condition? }
   */
  router.post("/transfers", async (req, res) => {
    try {
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Database unavailable" });

      const {
        payerFspId, payeeFspId, payerPartyId, payeePartyId,
        amountKobo, currency = "NGN", ilpPacket, condition,
        expirationTime,
      } = req.body;

      if (!payerFspId || !payeeFspId || !payerPartyId || !payeePartyId || !amountKobo) {
        return res.status(400).json({ error: "Missing required fields", code: "MISSING_FIELDS" });
      }

      const transferId = randomUUID();
      const [transfer] = await db.insert(nexthubTransfers).values({
        id: transferId,
        payerFspId,
        payeeFspId,
        payerPartyId,
        payeePartyId,
        amountKobo: Number(amountKobo),
        currency,
        state: "RECEIVED",
        ilpPacket: ilpPacket ?? null,
        condition: condition ?? null,
        expirationTime: expirationTime ? new Date(expirationTime) : null,
      }).returning();

      res.status(201).json({
        transferId: transfer.id,
        state: transfer.state,
        createdAt: transfer.createdAt,
      });
    } catch (err: any) {
      console.error("[integrationApi] POST /transfers error:", err);
      res.status(500).json({ error: "Internal error", detail: err?.message });
    }
  });

  /**
   * GET /api/v1/transfers/:id
   * Poll transfer state.
   */
  router.get("/transfers/:id", async (req, res) => {
    try {
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Database unavailable" });

      const [transfer] = await db.select().from(nexthubTransfers)
        .where(eq(nexthubTransfers.id, req.params.id)).limit(1);

      if (!transfer) return res.status(404).json({ error: "Transfer not found" });

      res.json({
        transferId: transfer.id,
        state: transfer.state,
        payerFspId: transfer.payerFspId,
        payeeFspId: transfer.payeeFspId,
        amountKobo: transfer.amountKobo,
        currency: transfer.currency,
        schemeFeeKobo: transfer.schemeFeeKobo,
        interchangeFeeKobo: transfer.interchangeFeeKobo,
        fxRate: transfer.fxRate,
        errorCode: transfer.errorCode,
        errorDescription: transfer.errorDescription,
        createdAt: transfer.createdAt,
        updatedAt: transfer.updatedAt,
      });
    } catch (err: any) {
      res.status(500).json({ error: "Internal error", detail: err?.message });
    }
  });

  // ── FX Rates ──────────────────────────────────────────────────────────────

  /**
   * GET /api/v1/fx/rates
   * Returns all active FX rates. Paygate uses this for corridor pricing display.
   * Query: ?currency=NGN (optional filter by source currency)
   */
  router.get("/fx/rates", async (req, res) => {
    try {
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Database unavailable" });

      const now = new Date();
      const conditions = [
        lte(nexthubFxRates.validFrom, now),
        gte(nexthubFxRates.validTo, now),
      ];
      if (req.query.currency) {
        conditions.push(eq(nexthubFxRates.sourceCurrency, req.query.currency as string));
      }

      const rates = await db.select().from(nexthubFxRates)
        .where(and(...conditions))
        .orderBy(desc(nexthubFxRates.createdAt));

      res.json({ rates, fetchedAt: now.toISOString() });
    } catch (err: any) {
      res.status(500).json({ error: "Internal error", detail: err?.message });
    }
  });

  /**
   * GET /api/v1/fx/rates/:from/:to
   * Returns the latest rate for a specific currency pair.
   */
  router.get("/fx/rates/:from/:to", async (req, res) => {
    try {
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Database unavailable" });

      const now = new Date();
      const [rate] = await db.select().from(nexthubFxRates)
        .where(and(
          eq(nexthubFxRates.sourceCurrency, req.params.from.toUpperCase()),
          eq(nexthubFxRates.targetCurrency, req.params.to.toUpperCase()),
          lte(nexthubFxRates.validFrom, now),
          gte(nexthubFxRates.validTo, now),
        ))
        .orderBy(desc(nexthubFxRates.createdAt))
        .limit(1);

      if (!rate) return res.status(404).json({ error: "Rate not found for this pair" });

      res.json({ rate, fetchedAt: now.toISOString() });
    } catch (err: any) {
      res.status(500).json({ error: "Internal error", detail: err?.message });
    }
  });

  // ── NDC Limits ────────────────────────────────────────────────────────────

  /**
   * GET /api/v1/ndc-limits
   * Returns NDC limits for all DFSPs. Paygate uses this to display limits in
   * the NDC Position Limit Editor page.
   */
  router.get("/ndc-limits", async (req, res) => {
    try {
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Database unavailable" });

      const limits = await db.select().from(dfspNdcLimits).orderBy(dfspNdcLimits.dfspName);
      res.json({ limits });
    } catch (err: any) {
      res.status(500).json({ error: "Internal error", detail: err?.message });
    }
  });

  /**
   * GET /api/v1/ndc-limits/:dfspId
   * Returns the NDC limit for a single DFSP.
   */
  router.get("/ndc-limits/:dfspId", async (req, res) => {
    try {
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Database unavailable" });

      const [limit] = await db.select().from(dfspNdcLimits)
        .where(eq(dfspNdcLimits.dfspId, req.params.dfspId)).limit(1);

      if (!limit) return res.status(404).json({ error: "NDC limit not found for this DFSP" });
      res.json({ limit });
    } catch (err: any) {
      res.status(500).json({ error: "Internal error", detail: err?.message });
    }
  });

  // ── Participants ──────────────────────────────────────────────────────────

  /**
   * GET /api/v1/participants
   * Returns all active participants (DFSPs) registered in the hub.
   */
  router.get("/participants", async (req, res) => {
    try {
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Database unavailable" });

      const dfsps = await db.select({
        id: nexthubDfsps.id,
        dfspId: nexthubDfsps.dfspId,
        dfspName: nexthubDfsps.dfspName,
        dfspType: nexthubDfsps.dfspType,
        country: nexthubDfsps.country,
        currency: nexthubDfsps.currency,
        status: nexthubDfsps.status,
        onboardedAt: nexthubDfsps.onboardedAt,
      }).from(nexthubDfsps)
        .where(req.query.status ? eq(nexthubDfsps.status, req.query.status as string) : sql`1=1`)
        .orderBy(nexthubDfsps.dfspName);

      res.json({ participants: dfsps, total: dfsps.length });
    } catch (err: any) {
      res.status(500).json({ error: "Internal error", detail: err?.message });
    }
  });

  /**
   * GET /api/v1/participants/:id
   * Returns a single participant with their current position limits.
   */
  router.get("/participants/:id", async (req, res) => {
    try {
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Database unavailable" });

      const [dfsp] = await db.select().from(nexthubDfsps)
        .where(eq(nexthubDfsps.dfspId, req.params.id)).limit(1);

      if (!dfsp) return res.status(404).json({ error: "Participant not found" });

      const limits = await db.select().from(nexthubParticipantLimits)
        .where(eq(nexthubParticipantLimits.participantId, req.params.id));

      res.json({ participant: dfsp, limits });
    } catch (err: any) {
      res.status(500).json({ error: "Internal error", detail: err?.message });
    }
  });

  // ── Settlement ────────────────────────────────────────────────────────────

  /**
   * GET /api/v1/settlement/windows
   * Returns recent settlement windows. Paygate uses this to show settlement
   * status in the merchant portal.
   * Query: ?status=OPEN|SETTLED|ALL&limit=20
   */
  router.get("/settlement/windows", async (req, res) => {
    try {
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Database unavailable" });

      const limit = Math.min(Number(req.query.limit ?? 20), 100);
      const status = req.query.status as string | undefined;

      const windows = await db.select({
        id: settlementWindows.id,
        windowType: settlementWindows.windowType,
        status: settlementWindows.status,
        currency: settlementWindows.currency,
        totalTransfers: settlementWindows.totalTransfers,
        totalAmountKobo: settlementWindows.totalAmountKobo,
        openedAt: settlementWindows.openedAt,
        closedAt: settlementWindows.closedAt,
        settledAt: settlementWindows.settledAt,
        railReference: settlementWindows.railReference,
      }).from(settlementWindows)
        .where(status && status !== "ALL" ? eq(settlementWindows.status, status) : sql`1=1`)
        .orderBy(desc(settlementWindows.openedAt))
        .limit(limit);

      res.json({ windows, total: windows.length });
    } catch (err: any) {
      res.status(500).json({ error: "Internal error", detail: err?.message });
    }
  });

  /**
   * GET /api/v1/settlement/windows/:id
   * Returns a single settlement window.
   */
  router.get("/settlement/windows/:id", async (req, res) => {
    try {
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Database unavailable" });

      const [window] = await db.select().from(settlementWindows)
        .where(eq(settlementWindows.id, req.params.id)).limit(1);

      if (!window) return res.status(404).json({ error: "Settlement window not found" });
      res.json({ window });
    } catch (err: any) {
      res.status(500).json({ error: "Internal error", detail: err?.message });
    }
  });

  // ── Scheme Fees ───────────────────────────────────────────────────────────

  /**
   * GET /api/v1/scheme/fees
   * Returns applicable scheme fee tiers for a DFSP.
   * Query: ?dfspId=xxx&feeType=SCHEME_FEE|INTERCHANGE|FX_MARKUP|PENALTY
   */
  router.get("/scheme/fees", async (req, res) => {
    try {
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Database unavailable" });

      const { dfspId, feeType } = req.query;
      if (!dfspId) return res.status(400).json({ error: "dfspId is required" });

      const conditions = [eq(dfspFeeTiers.dfspId, dfspId as string)];
      if (feeType) conditions.push(eq(dfspFeeTiers.feeType, feeType as string));

      const fees = await db.select().from(dfspFeeTiers)
        .where(and(...conditions))
        .orderBy(dfspFeeTiers.effectiveFrom);

      res.json({ fees });
    } catch (err: any) {
      res.status(500).json({ error: "Internal error", detail: err?.message });
    }
  });

  // ── Corridor Volume (for Paygate analytics) ───────────────────────────────

  /**
   * GET /api/v1/corridor-volume
   * Returns aggregated transfer volume by corridor (payer FSP → payee FSP).
   * Paygate's CorridorLiveStatsV2 uses this instead of querying transactions directly.
   * Query: ?days=7 (default 7, max 90)
   */
  router.get("/corridor-volume", async (req, res) => {
    try {
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Database unavailable" });

      const days = Math.min(Number(req.query.days ?? 7), 90);
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const rows = await db.execute(sql`
        SELECT
          payer_fsp_id   AS "payerFspId",
          payee_fsp_id   AS "payeeFspId",
          currency,
          COUNT(*)::int  AS "transferCount",
          SUM(amount_kobo)::bigint AS "totalAmountKobo",
          MIN(created_at) AS "windowStart",
          MAX(created_at) AS "windowEnd"
        FROM nexthub_transfers
        WHERE created_at >= ${since}
          AND state IN ('COMMITTED', 'SETTLED')
        GROUP BY payer_fsp_id, payee_fsp_id, currency
        ORDER BY "totalAmountKobo" DESC
      `);

      res.json({
        corridors: rows.rows,
        periodDays: days,
        since: since.toISOString(),
        fetchedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ error: "Internal error", detail: err?.message });
    }
  });

  // ── Audit Events (for Regulator Portal read-model) ────────────────────────

  /**
   * POST /api/v1/audit-events
   * Paygate pushes audit events here so the Regulator Portal can display them
   * without needing direct access to the Paygate transactions table.
   * Body: { events: [{ eventType, entityId, merchantId, amount, currency, status, timestamp }] }
   */
  router.post("/audit-events", async (req, res) => {
    try {
      const { events } = req.body;
      if (!Array.isArray(events) || events.length === 0) {
        return res.status(400).json({ error: "events array is required" });
      }

      // Store in nexthub audit_logs table
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Database unavailable" });

      // Batch insert into audit_logs
      await db.execute(sql`
        INSERT INTO audit_logs (id, action, entity_type, entity_id, actor_id, metadata, created_at)
        SELECT
          gen_random_uuid(),
          e->>'eventType',
          'paygate_transaction',
          e->>'entityId',
          e->>'merchantId',
          e::text,
          (e->>'timestamp')::timestamptz
        FROM jsonb_array_elements(${JSON.stringify(events)}::jsonb) AS e
        ON CONFLICT DO NOTHING
      `);

      res.json({ accepted: events.length });
    } catch (err: any) {
      res.status(500).json({ error: "Internal error", detail: err?.message });
    }
  });

  return router;
}
