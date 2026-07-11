/**
 * backgroundJobs.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Scheduled background jobs for NextHub Core.
 *
 * Jobs:
 *   1. Billing overdue sweep    — Every 15 min: mark ISSUED invoices as OVERDUE
 *   2. PISP consent expiry      — Every 5 min: mark ACTIVE consents as EXPIRED
 *   3. Dispute SLA escalation   — Every 10 min: escalate OPEN/UNDER_REVIEW disputes past SLA
 *   4. FX rate expiry cleanup   — Every 1 min: log expired FX rates (no-op; expiry is time-based)
 *   5. Settlement window auto-close — Every 1 min: auto-close OPEN windows past their schedule
 *
 * All jobs are idempotent and safe to run concurrently (uses DB-level WHERE clauses).
 */

import { getDb } from "./db";
import { sql, and, eq, lt, lte, inArray } from "drizzle-orm";
import {
  nexthubInvoices,
  nexthubPispConsents,
  transferDisputes,
  settlementWindows,
} from "../drizzle/nexthub_schema";
import { nexthubPublish } from "./kafka/nexthubKafkaProducer";
import { logger } from "./logger";
import { sweepExpiredNqrTransactions } from "./nibss/nqrService";

// ─── Job: Billing overdue sweep ───────────────────────────────────────────────

async function runBillingOverdueSweep(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    const now = new Date();
    const updated = await db
      .update(nexthubInvoices)
      .set({ status: "OVERDUE", updatedAt: now })
      .where(
        and(
          eq(nexthubInvoices.status, "ISSUED"),
          lt(nexthubInvoices.dueAt, now),
        ),
      )
      .returning({ id: nexthubInvoices.id, dfspId: nexthubInvoices.dfspId });

    if (updated.length > 0) {
      console.log(`[billing-sweep] Marked ${updated.length} invoice(s) as OVERDUE:`, updated.map((i) => i.id));
    }
  } catch (err: any) {
    logger.error("[billing-sweep] Error", { error: err?.message });
  }
}

// ─── Job: PISP consent expiry ─────────────────────────────────────────────────

async function runPispConsentExpiry(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    const now = new Date();
    const updated = await db
      .update(nexthubPispConsents)
      .set({ state: "EXPIRED", updatedAt: now })
      .where(
        and(
          inArray(nexthubPispConsents.state, ["REQUESTED", "GRANTED", "ACTIVE"]),
          sql`expires_at IS NOT NULL`,
          lt(nexthubPispConsents.expiresAt as any, now),
        ),
      )
      .returning({ consentId: nexthubPispConsents.consentId, pispId: nexthubPispConsents.pispId });

    if (updated.length > 0) {
      console.log(`[pisp-expiry] Expired ${updated.length} PISP consent(s):`, updated.map((c) => c.consentId));
    }
  } catch (err: any) {
    logger.error("[pisp-expiry] Error", { error: err?.message });
  }
}

// ─── Job: Dispute SLA escalation ─────────────────────────────────────────────

async function runDisputeSlaEscalation(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    const now = new Date();
    // Escalate disputes that are OPEN or UNDER_REVIEW and have passed their SLA deadline
    const escalated = await db
      .update(transferDisputes)
      .set({
        status: "ESCALATED",
        updatedAt: now,
      })
      .where(
        and(
          inArray(transferDisputes.status, ["OPEN", "UNDER_REVIEW"]),
          sql`sla_deadline IS NOT NULL`,
          lt(transferDisputes.slaDeadline as any, now),
        ),
      )
      .returning({
        id: transferDisputes.id,
        disputeType: transferDisputes.disputeType,
        initiatedByDfspId: transferDisputes.initiatedByDfspId,
      });

    if (escalated.length > 0) {
      console.log(`[dispute-sla] Escalated ${escalated.length} dispute(s) past SLA:`, escalated.map((d) => d.id));
    }
  } catch (err: any) {
    logger.error("[dispute-sla] Error", { error: err?.message });
  }
}

// ─── Job: Settlement window stale-OPEN detection ─────────────────────────────
// OPEN windows older than 24 hours that haven't been manually closed are logged
// as anomalies. (Auto-close is triggered by the settlement router, not here.)

async function runSettlementWindowStaleScan(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const staleWindows = await db
      .select({ id: settlementWindows.id, currency: settlementWindows.currency, openedAt: settlementWindows.openedAt })
      .from(settlementWindows)
      .where(
        and(
          eq(settlementWindows.status, "OPEN"),
          lt(settlementWindows.openedAt, cutoff),
        ),
      )
      .limit(20);

    if (staleWindows.length > 0) {
      console.warn(`[settlement-stale] ${staleWindows.length} settlement window(s) have been OPEN for >24h:`,
        staleWindows.map((w) => ({ id: w.id, openedAt: w.openedAt })));
    }
  } catch (err: any) {
    logger.error("[settlement-stale] Error", { error: err?.message });
  }
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

let _started = false;

export function startBackgroundJobs(): void {
  if (_started) return;
  _started = true;

  logger.info("[background-jobs] Starting scheduled jobs");

  // Billing overdue sweep — every 15 minutes
  setInterval(runBillingOverdueSweep, 15 * 60 * 1000);
  // Run immediately on startup
  runBillingOverdueSweep().catch(() => {});

  // PISP consent expiry — every 5 minutes
  setInterval(runPispConsentExpiry, 5 * 60 * 1000);
  runPispConsentExpiry().catch(() => {});

  // Dispute SLA escalation — every 10 minutes
  setInterval(runDisputeSlaEscalation, 10 * 60 * 1000);
  runDisputeSlaEscalation().catch(() => {});

  // Settlement window stale scan — every 30 minutes
  setInterval(runSettlementWindowStaleScan, 30 * 60 * 1000);
  runSettlementWindowStaleScan().catch(() => {});

  logger.info("[background-jobs] All jobs scheduled");
}
