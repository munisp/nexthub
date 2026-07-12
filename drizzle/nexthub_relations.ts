/**
 * nexthub_relations.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Drizzle ORM relational definitions for all NextHub schema tables.
 *
 * These relations enable db.query.* relational API (JOIN-free, type-safe
 * nested queries) across the entire NextHub domain model.
 *
 * Usage:
 *   const participant = await db.query.nexthubParticipants.findFirst({
 *     where: eq(nexthubParticipants.dfspId, "DFSP001"),
 *     with: {
 *       limits: true,
 *       positions: true,
 *       liquidityWindows: { where: eq(nexthubLiquidityWindows.status, "OPEN") },
 *     },
 *   });
 */

import { relations } from "drizzle-orm";
import {
  // Core participant tables
  nexthubParticipants,
  nexthubParticipantLimits,
  nexthubParticipantPositions,
  nexthubLiquidityWindows,
  // Settlement
  settlementWindows,
  settlementNetPositions,
  // DFSPs
  nexthubDfsps,
  // Transfers & disputes
  nexthubTransfers,
  transferDisputes,
  feePostings,
  nexthubBulkTransfers,
  // PISP
  nexthubPispConsents,
  // FX
  nexthubFxRates,
  // Billing
  nexthubInvoices,
  dfspFeeTiers,
  // Reconciliation
  reconciliationExceptions,
  // Security
  nexthubSecurityEvents,
  amlRules,
  // Oracles
  nexthubOracles,
  // Remittance
  remittanceCorridors,
  remittanceTransfers,
  // Healthcare
  healthcareClaims,
  insurancePremiumPayments,
  // G2P
  g2pDisbursementBatches,
  // CBDC
  cbdcAccounts,
  cbdcTransfers,
  // Infrastructure
  permifyRelationships,
  permifyPermissionChecks,
  keycloakProvisioningLog,
  lakehouseSyncQueue,
  fluvioStreamEvents,
  fluvioTopics,
} from "./nexthub_schema";

// ─── Participant ──────────────────────────────────────────────────────────────

export const nexthubParticipantsRelations = relations(
  nexthubParticipants,
  ({ one, many }) => ({
    limits: many(nexthubParticipantLimits),
    positions: many(nexthubParticipantPositions),
    liquidityWindows: many(nexthubLiquidityWindows),
    dfsp: one(nexthubDfsps, {
      fields: [nexthubParticipants.dfspId],
      references: [nexthubDfsps.dfspId],
    }),
    outboundTransfers: many(nexthubTransfers, {
      relationName: "payerParticipant",
    }),
    inboundTransfers: many(nexthubTransfers, {
      relationName: "payeeParticipant",
    }),
    invoices: many(nexthubInvoices),
    feeTiers: many(dfspFeeTiers),
  }),
);

export const nexthubParticipantLimitsRelations = relations(
  nexthubParticipantLimits,
  ({ one }) => ({
    participant: one(nexthubParticipants, {
      fields: [nexthubParticipantLimits.participantId],
      references: [nexthubParticipants.id],
    }),
  }),
);

export const nexthubParticipantPositionsRelations = relations(
  nexthubParticipantPositions,
  ({ one }) => ({
    participant: one(nexthubParticipants, {
      fields: [nexthubParticipantPositions.participantId],
      references: [nexthubParticipants.id],
    }),
  }),
);

export const nexthubLiquidityWindowsRelations = relations(
  nexthubLiquidityWindows,
  ({ one }) => ({
    participant: one(nexthubParticipants, {
      fields: [nexthubLiquidityWindows.participantId],
      references: [nexthubParticipants.id],
    }),
  }),
);

// ─── DFSP ─────────────────────────────────────────────────────────────────────

export const nexthubDfspsRelations = relations(nexthubDfsps, ({ one, many }) => ({
  participant: one(nexthubParticipants, {
    fields: [nexthubDfsps.dfspId],
    references: [nexthubParticipants.dfspId],
  }),
  securityEvents: many(nexthubSecurityEvents),
  invoices: many(nexthubInvoices),
  feeTiers: many(dfspFeeTiers),
}));

// ─── Settlement ───────────────────────────────────────────────────────────────

export const settlementWindowsRelations = relations(
  settlementWindows,
  ({ many }) => ({
    netPositions: many(settlementNetPositions),
  }),
);

export const settlementNetPositionsRelations = relations(
  settlementNetPositions,
  ({ one }) => ({
    window: one(settlementWindows, {
      fields: [settlementNetPositions.windowId],
      references: [settlementWindows.id],
    }),
  }),
);

// ─── Transfers ────────────────────────────────────────────────────────────────

export const nexthubTransfersRelations = relations(
  nexthubTransfers,
  ({ one, many }) => ({
    payerParticipant: one(nexthubParticipants, {
      fields: [nexthubTransfers.payerFspId],
      references: [nexthubParticipants.dfspId],
      relationName: "payerParticipant",
    }),
    payeeParticipant: one(nexthubParticipants, {
      fields: [nexthubTransfers.payeeFspId],
      references: [nexthubParticipants.dfspId],
      relationName: "payeeParticipant",
    }),
    disputes: many(transferDisputes),
    feePostings: many(feePostings),
  }),
);

export const transferDisputesRelations = relations(
  transferDisputes,
  ({ one }) => ({
    transfer: one(nexthubTransfers, {
      fields: [transferDisputes.transferId],
      references: [nexthubTransfers.id],
    }),
    initiatedByDfsp: one(nexthubDfsps, {
      fields: [transferDisputes.initiatedByDfspId],
      references: [nexthubDfsps.dfspId],
      relationName: "initiatorDfsp",
    }),
    respondingDfsp: one(nexthubDfsps, {
      fields: [transferDisputes.respondingDfspId],
      references: [nexthubDfsps.dfspId],
      relationName: "respondentDfsp",
    }),
  }),
);

export const feePostingsRelations = relations(feePostings, ({ one }) => ({
  transfer: one(nexthubTransfers, {
    fields: [feePostings.transferId],
    references: [nexthubTransfers.id],
  }),
}));

// ─── Bulk Transfers ───────────────────────────────────────────────────────────

export const nexthubBulkTransfersRelations = relations(
  nexthubBulkTransfers,
  ({ one }) => ({
    payerParticipant: one(nexthubParticipants, {
      fields: [nexthubBulkTransfers.payerFsp],
      references: [nexthubParticipants.dfspId],
    }),
  }),
);

// ─── PISP Consents ────────────────────────────────────────────────────────────

export const nexthubPispConsentsRelations = relations(
  nexthubPispConsents,
  ({ one }) => ({
    dfsp: one(nexthubDfsps, {
      fields: [nexthubPispConsents.dfspId],
      references: [nexthubDfsps.dfspId],
    }),
  }),
);

// ─── FX Rates ─────────────────────────────────────────────────────────────────
// nexthubFxRates uses a 'provider' string field (not a FK to nexthubDfsps),
// so no relational definition is needed here.

// ─── Billing ──────────────────────────────────────────────────────────────────

export const nexthubInvoicesRelations = relations(nexthubInvoices, ({ one }) => ({
  dfsp: one(nexthubDfsps, {
    fields: [nexthubInvoices.dfspId],
    references: [nexthubDfsps.dfspId],
  }),
}));

export const dfspFeeTiersRelations = relations(dfspFeeTiers, ({ one }) => ({
  dfsp: one(nexthubDfsps, {
    fields: [dfspFeeTiers.dfspId],
    references: [nexthubDfsps.dfspId],
  }),
}));

// ─── Reconciliation ───────────────────────────────────────────────────────────

export const reconciliationExceptionsRelations = relations(
  reconciliationExceptions,
  ({ one }) => ({
    transfer: one(nexthubTransfers, {
      fields: [reconciliationExceptions.transferId],
      references: [nexthubTransfers.id],
    }),
  }),
);

// ─── Security ─────────────────────────────────────────────────────────────────

export const nexthubSecurityEventsRelations = relations(
  nexthubSecurityEvents,
  ({ one }) => ({
    dfsp: one(nexthubDfsps, {
      fields: [nexthubSecurityEvents.dfspId],
      references: [nexthubDfsps.dfspId],
    }),
  }),
);

// ─── Remittance ───────────────────────────────────────────────────────────────

export const remittanceTransfersRelations = relations(
  remittanceTransfers,
  ({ one }) => ({
    corridor: one(remittanceCorridors, {
      fields: [remittanceTransfers.corridorId],
      references: [remittanceCorridors.id],
    }),
  }),
);

export const remittanceCorridorsRelations = relations(
  remittanceCorridors,
  ({ many }) => ({
    transfers: many(remittanceTransfers),
  }),
);

// ─── Healthcare ───────────────────────────────────────────────────────────────

export const healthcareClaimsRelations = relations(
  healthcareClaims,
  ({ many }) => ({
    premiumPayments: many(insurancePremiumPayments),
  }),
);

// ─── G2P ─────────────────────────────────────────────────────────────────────
// G2P uses g2pDisbursementBatches (no separate beneficiaries table yet).

export const g2pDisbursementBatchesRelations = relations(
  g2pDisbursementBatches,
  ({ many }) => ({
    // Future: link to individual disbursement line items when table is added
  }),
);

// ─── CBDC ─────────────────────────────────────────────────────────────────────
// cbdcTransfers uses senderWallet/receiverWallet string fields (not FK to cbdcAccounts.id).
// Wallet-based lookups are done via walletId index on cbdcAccounts.

export const cbdcAccountsRelations = relations(cbdcAccounts, ({ many }) => ({
  outboundTransfers: many(cbdcTransfers, {
    relationName: "senderCbdcAccount",
  }),
  inboundTransfers: many(cbdcTransfers, {
    relationName: "receiverCbdcAccount",
  }),
}));

export const cbdcTransfersRelations = relations(cbdcTransfers, ({ one }) => ({
  // Logical relations via wallet lookup — no direct FK constraint in schema
}));

// ─── Fluvio ───────────────────────────────────────────────────────────────────

export const fluvioStreamEventsRelations = relations(
  fluvioStreamEvents,
  ({ one }) => ({
    topic: one(fluvioTopics, {
      fields: [fluvioStreamEvents.topic],
      references: [fluvioTopics.topicName],
    }),
  }),
);

export const fluvioTopicsRelations = relations(fluvioTopics, ({ many }) => ({
  events: many(fluvioStreamEvents),
}));

// ─── Permify ──────────────────────────────────────────────────────────────────

export const permifyRelationshipsRelations = relations(
  permifyRelationships,
  ({ many }) => ({
    checks: many(permifyPermissionChecks),
  }),
);
