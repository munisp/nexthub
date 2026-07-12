/**
 * preparedStatements.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Drizzle ORM prepared statements for all hot-path queries.
 *
 * Prepared statements are compiled once and executed many times, providing:
 *  - Reduced query planning overhead on every request
 *  - Full TypeScript type inference on both inputs and outputs
 *  - Protection against SQL injection (parameterized by design)
 *
 * Usage:
 *   import { getPs } from "./db/preparedStatements";
 *   const ps = await getPs();
 *   const participant = await ps.getParticipantByDfspId.execute({ dfspId: "DFSP001" });
 */

import { eq, and, ne, desc, asc, sql, placeholder } from "drizzle-orm";
import { getDb } from "../db";
import {
  nexthubParticipants,
  nexthubParticipantLimits,
  nexthubParticipantPositions,
  nexthubLiquidityWindows,
  nexthubTransfers,
  nexthubFxRates,
  nexthubPispConsents,
  nexthubInvoices,
  nexthubDfsps,
  transferDisputes,
  settlementWindows,
  settlementNetPositions,
  reconciliationExceptions,
  nexthubSecurityEvents,
  amlRules,
  nexthubBulkTransfers,
  nexthubOracles,
} from "../../drizzle/nexthub_schema";

// ─── Lazy initialisation ──────────────────────────────────────────────────────

type PreparedStatements = Awaited<ReturnType<typeof buildPreparedStatements>>;
let _ps: PreparedStatements | null = null;

async function buildPreparedStatements() {
  const db = await getDb();
  if (!db) throw new Error("[PS] Database unavailable");

  // ── Participant queries ────────────────────────────────────────────────────

  const getParticipantById = db
    .select()
    .from(nexthubParticipants)
    .where(eq(nexthubParticipants.id, placeholder("id")))
    .limit(1)
    .prepare("get_participant_by_id");

  const getParticipantByDfspId = db
    .select()
    .from(nexthubParticipants)
    .where(eq(nexthubParticipants.dfspId, placeholder("dfspId")))
    .limit(1)
    .prepare("get_participant_by_dfsp_id");

  const listActiveParticipants = db
    .select()
    .from(nexthubParticipants)
    .where(ne(nexthubParticipants.status, "OFFBOARDED"))
    .orderBy(asc(nexthubParticipants.name))
    .prepare("list_active_participants");

  // ── Participant limits ─────────────────────────────────────────────────────

  const getParticipantLimits = db
    .select()
    .from(nexthubParticipantLimits)
    .where(
      and(
        eq(nexthubParticipantLimits.participantId, placeholder("participantId")),
        eq(nexthubParticipantLimits.currency, placeholder("currency")),
      ),
    )
    .limit(1)
    .prepare("get_participant_limits");

  // ── Participant positions ──────────────────────────────────────────────────

  const getParticipantPosition = db
    .select()
    .from(nexthubParticipantPositions)
    .where(
      and(
        eq(nexthubParticipantPositions.participantId, placeholder("participantId")),
        eq(nexthubParticipantPositions.currency, placeholder("currency")),
      ),
    )
    .limit(1)
    .prepare("get_participant_position");

  // ── Liquidity windows ─────────────────────────────────────────────────────

  const getOpenLiquidityWindows = db
    .select()
    .from(nexthubLiquidityWindows)
    .where(
      and(
        eq(nexthubLiquidityWindows.participantId, placeholder("participantId")),
        eq(nexthubLiquidityWindows.status, "OPEN"),
      ),
    )
    .orderBy(desc(nexthubLiquidityWindows.openedAt))
    .prepare("get_open_liquidity_windows");

  // ── Transfers ─────────────────────────────────────────────────────────────

  const getTransferById = db
    .select()
    .from(nexthubTransfers)
    .where(eq(nexthubTransfers.id, placeholder("id")))
    .limit(1)
    .prepare("get_transfer_by_id");

  const getTransfersByPayerFsp = db
    .select()
    .from(nexthubTransfers)
    .where(eq(nexthubTransfers.payerFspId, placeholder("payerFspId")))
    .orderBy(desc(nexthubTransfers.createdAt))
    .prepare("get_transfers_by_payer_fsp");

  const getTransfersByPayeeFsp = db
    .select()
    .from(nexthubTransfers)
    .where(eq(nexthubTransfers.payeeFspId, placeholder("payeeFspId")))
    .orderBy(desc(nexthubTransfers.createdAt))
    .prepare("get_transfers_by_payee_fsp");

  // ── FX Rates ──────────────────────────────────────────────────────────────

  const getActiveFxRate = db
    .select()
    .from(nexthubFxRates)
    .where(
      and(
        eq(nexthubFxRates.sourceCurrency, placeholder("sourceCurrency")),
        eq(nexthubFxRates.targetCurrency, placeholder("targetCurrency")),
        sql`${nexthubFxRates.validTo} > NOW()`,
      ),
    )
    .orderBy(desc(nexthubFxRates.validFrom))
    .limit(1)
    .prepare("get_active_fx_rate");

  // ── PISP Consents ─────────────────────────────────────────────────────────

  const getActiveConsentsByConsumer = db
    .select()
    .from(nexthubPispConsents)
    .where(
      and(
        eq(nexthubPispConsents.consumerId, placeholder("consumerId")),
        eq(nexthubPispConsents.state, "ACTIVE"),
      ),
    )
    .orderBy(desc(nexthubPispConsents.createdAt))
    .prepare("get_active_consents_by_consumer");

  const getConsentById = db
    .select()
    .from(nexthubPispConsents)
    .where(eq(nexthubPispConsents.consentId, placeholder("consentId")))
    .limit(1)
    .prepare("get_consent_by_id");

  // ── Invoices ──────────────────────────────────────────────────────────────

  const getInvoicesByDfsp = db
    .select()
    .from(nexthubInvoices)
    .where(eq(nexthubInvoices.dfspId, placeholder("dfspId")))
    .orderBy(desc(nexthubInvoices.createdAt))
    .prepare("get_invoices_by_dfsp");

  const getOverdueInvoices = db
    .select()
    .from(nexthubInvoices)
    .where(
      and(
        eq(nexthubInvoices.status, "ISSUED"),
        sql`${nexthubInvoices.dueAt} < NOW()`,
      ),
    )
    .prepare("get_overdue_invoices");

  // ── DFSPs ─────────────────────────────────────────────────────────────────

  const getDfspById = db
    .select()
    .from(nexthubDfsps)
    .where(eq(nexthubDfsps.dfspId, placeholder("dfspId")))
    .limit(1)
    .prepare("get_dfsp_by_id");

  const listActiveDfsps = db
    .select()
    .from(nexthubDfsps)
    .where(eq(nexthubDfsps.status, "ACTIVE"))
    .orderBy(asc(nexthubDfsps.dfspName))
    .prepare("list_active_dfsps");

  // ── Disputes ──────────────────────────────────────────────────────────────

  const getDisputeById = db
    .select()
    .from(transferDisputes)
    .where(eq(transferDisputes.id, placeholder("id")))
    .limit(1)
    .prepare("get_dispute_by_id");

  const getOpenDisputesByDfsp = db
    .select()
    .from(transferDisputes)
    .where(
      and(
        eq(transferDisputes.initiatedByDfspId, placeholder("dfspId")),
        eq(transferDisputes.status, "OPEN"),
      ),
    )
    .orderBy(desc(transferDisputes.createdAt))
    .prepare("get_open_disputes_by_dfsp");

  // ── Settlement ────────────────────────────────────────────────────────────

  const getOpenSettlementWindows = db
    .select()
    .from(settlementWindows)
    .where(eq(settlementWindows.status, "OPEN"))
    .orderBy(desc(settlementWindows.openedAt))
    .prepare("get_open_settlement_windows");

  const getSettlementWindowById = db
    .select()
    .from(settlementWindows)
    .where(eq(settlementWindows.id, placeholder("id")))
    .limit(1)
    .prepare("get_settlement_window_by_id");

  const getNetPositionsByWindow = db
    .select()
    .from(settlementNetPositions)
    .where(eq(settlementNetPositions.windowId, placeholder("windowId")))
    .prepare("get_net_positions_by_window");

  // ── Reconciliation ────────────────────────────────────────────────────────

  const getOpenReconciliationExceptions = db
    .select()
    .from(reconciliationExceptions)
    .where(eq(reconciliationExceptions.status, "OPEN"))
    .orderBy(desc(reconciliationExceptions.createdAt))
    .prepare("get_open_reconciliation_exceptions");

  const getReconciliationExceptionById = db
    .select()
    .from(reconciliationExceptions)
    .where(eq(reconciliationExceptions.id, placeholder("id")))
    .limit(1)
    .prepare("get_reconciliation_exception_by_id");

  // ── Security ──────────────────────────────────────────────────────────────

  const getUnacknowledgedSecurityEvents = db
    .select()
    .from(nexthubSecurityEvents)
    .where(eq(nexthubSecurityEvents.acknowledged, false))
    .orderBy(desc(nexthubSecurityEvents.createdAt))
    .prepare("get_unacknowledged_security_events");

  const getEnabledAmlRules = db
    .select()
    .from(amlRules)
    .where(eq(amlRules.isEnabled, true))
    .orderBy(asc(amlRules.ruleName))
    .prepare("get_enabled_aml_rules");

  // ── Bulk Transfers ────────────────────────────────────────────────────────

  const getBulkTransferById = db
    .select()
    .from(nexthubBulkTransfers)
    .where(eq(nexthubBulkTransfers.bulkTransferId, placeholder("bulkTransferId")))
    .limit(1)
    .prepare("get_bulk_transfer_by_id");

  const getPendingBulkTransfers = db
    .select()
    .from(nexthubBulkTransfers)
    .where(eq(nexthubBulkTransfers.state, "RECEIVED"))
    .orderBy(asc(nexthubBulkTransfers.createdAt))
    .prepare("get_pending_bulk_transfers");

  // ── Oracles ───────────────────────────────────────────────────────────────

  const getActiveOracles = db
    .select()
    .from(nexthubOracles)
    .where(eq(nexthubOracles.isActive, 1))
    .orderBy(asc(nexthubOracles.oracleId))
    .prepare("get_active_oracles");

  return {
    // Participants
    getParticipantById,
    getParticipantByDfspId,
    listActiveParticipants,
    // Limits & positions
    getParticipantLimits,
    getParticipantPosition,
    // Liquidity
    getOpenLiquidityWindows,
    // Transfers
    getTransferById,
    getTransfersByPayerFsp,
    getTransfersByPayeeFsp,
    // FX
    getActiveFxRate,
    // PISP
    getActiveConsentsByConsumer,
    getConsentById,
    // Billing
    getInvoicesByDfsp,
    getOverdueInvoices,
    // DFSPs
    getDfspById,
    listActiveDfsps,
    // Disputes
    getDisputeById,
    getOpenDisputesByDfsp,
    // Settlement
    getOpenSettlementWindows,
    getSettlementWindowById,
    getNetPositionsByWindow,
    // Reconciliation
    getOpenReconciliationExceptions,
    getReconciliationExceptionById,
    // Security
    getUnacknowledgedSecurityEvents,
    getEnabledAmlRules,
    // Bulk transfers
    getBulkTransferById,
    getPendingBulkTransfers,
    // Oracles
    getActiveOracles,
  };
}

/**
 * Get the singleton prepared-statements object.
 * Call this once per request handler — it is safe to call multiple times.
 */
export async function getPs(): Promise<PreparedStatements> {
  if (!_ps) {
    _ps = await buildPreparedStatements();
  }
  return _ps;
}
