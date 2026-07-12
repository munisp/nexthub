/**
 * schemaValidators.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Zod-based schema validators derived directly from Drizzle inferred types.
 *
 * These validators provide:
 *  - Runtime validation of insert/update payloads
 *  - Type guards for Drizzle select results
 *  - Consistent error messages across all API layers
 *  - createInsertSchema / createSelectSchema wrappers for all nexthub tables
 *
 * Usage:
 *   import { participantInsertSchema } from "./db/schemaValidators";
 *   const parsed = participantInsertSchema.parse(req.body);
 */

import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import {
  nexthubParticipants,
  nexthubParticipantLimits,
  nexthubTransfers,
  nexthubFxRates,
  nexthubPispConsents,
  nexthubInvoices,
  nexthubDfsps,
  transferDisputes,
  settlementWindows,
  reconciliationExceptions,
  nexthubSecurityEvents,
  amlRules,
  nexthubBulkTransfers,
  nexthubOracles,
  feePostings,
  dfspFeeTiers,
} from "../../drizzle/nexthub_schema";

// ─── Participants ─────────────────────────────────────────────────────────────

export const participantInsertSchema = createInsertSchema(nexthubParticipants, {
  id: z.string().min(1).max(64),
  name: z.string().min(2).max(128),
  dfspId: z.string().min(1).max(64),
  currency: z.string().length(3).default("NGN"),
  status: z.enum(["PENDING", "ACTIVE", "SUSPENDED", "OFFBOARDED"]).default("PENDING"),
  schemeType: z.enum(["FSPIOP", "ISO20022", "RTGS"]).default("FSPIOP"),
  endpointUrl: z.string().url(),
});

export const participantSelectSchema = createSelectSchema(nexthubParticipants);
export type ParticipantInsert = z.infer<typeof participantInsertSchema>;
export type ParticipantSelect = z.infer<typeof participantSelectSchema>;

// ─── Participant Limits ───────────────────────────────────────────────────────

export const participantLimitsInsertSchema = createInsertSchema(nexthubParticipantLimits, {
  participantId: z.string().min(1),
  currency: z.string().length(3).default("NGN"),
  netDebitCap: z.number().int().positive(),
  liquidityCover: z.number().int().min(0).default(0),
  alertThreshold: z.number().min(0).max(1).default(0.8),
});

export type ParticipantLimitsInsert = z.infer<typeof participantLimitsInsertSchema>;

// ─── Transfers ────────────────────────────────────────────────────────────────

export const transferInsertSchema = createInsertSchema(nexthubTransfers, {
  id: z.string().min(1).max(64),
  payerFspId: z.string().min(1).max(64),
  payeeFspId: z.string().min(1).max(64),
  amountKobo: z.number().int().positive(),
  currency: z.string().length(3).default("NGN"),
  state: z.enum(["RECEIVED", "RESERVED", "COMMITTED", "ABORTED"]).default("RECEIVED"),
});

export const transferSelectSchema = createSelectSchema(nexthubTransfers);
export type TransferInsert = z.infer<typeof transferInsertSchema>;
export type TransferSelect = z.infer<typeof transferSelectSchema>;

// ─── Disputes ─────────────────────────────────────────────────────────────────

export const disputeInsertSchema = createInsertSchema(transferDisputes, {
  transferId: z.string().min(1),
  initiatedByDfspId: z.string().min(1),
  respondingDfspId: z.string().optional(),
  amountKobo: z.number().int().positive(),
  currency: z.string().length(3).default("NGN"),
  reason: z.string().min(5).max(512),
  disputeType: z.string().min(1),
  status: z.enum(["OPEN", "UNDER_REVIEW", "UPHELD", "REJECTED", "ESCALATED", "RESOLVED"]).default("OPEN"),
});

export type DisputeInsert = z.infer<typeof disputeInsertSchema>;

// ─── FX Rates ─────────────────────────────────────────────────────────────────

export const fxRateInsertSchema = createInsertSchema(nexthubFxRates, {
  sourceCurrency: z.string().length(3),
  targetCurrency: z.string().length(3),
  rate: z.string().regex(/^\d+(\.\d+)?$/, "Rate must be a valid decimal string"),
  provider: z.string().min(1).default("nexthub-fx"),
  validFrom: z.date(),
  validTo: z.date(),
}).refine((data) => data.validTo > data.validFrom, {
  message: "validTo must be after validFrom",
  path: ["validTo"],
});

export type FxRateInsert = z.infer<typeof fxRateInsertSchema>;

// ─── PISP Consents ────────────────────────────────────────────────────────────

export const pispConsentInsertSchema = createInsertSchema(nexthubPispConsents, {
  consentId: z.string().min(1).max(64),
  consumerId: z.string().min(1).max(64),
  pispId: z.string().min(1).max(64),
  dfspId: z.string().min(1).max(64),
  scopes: z.string().default("[]"),
  state: z.enum(["REQUESTED", "GRANTED", "ACTIVE", "REVOKED", "EXPIRED"]).default("REQUESTED"),
});

export type PispConsentInsert = z.infer<typeof pispConsentInsertSchema>;

// ─── Invoices ─────────────────────────────────────────────────────────────────

export const invoiceInsertSchema = createInsertSchema(nexthubInvoices, {
  dfspId: z.string().min(1),
  dfspName: z.string().min(1),
  totalAmountKobo: z.number().int().min(0).default(0),
  currency: z.string().length(3).default("NGN"),
  status: z.enum(["DRAFT", "ISSUED", "PAID", "OVERDUE", "CANCELLED"]).default("DRAFT"),
  dueAt: z.date().optional(),
});

export type InvoiceInsert = z.infer<typeof invoiceInsertSchema>;

// ─── DFSPs ────────────────────────────────────────────────────────────────────

export const dfspInsertSchema = createInsertSchema(nexthubDfsps, {
  dfspId: z.string().min(1).max(64),
  dfspName: z.string().min(2).max(128),
  status: z.enum(["ACTIVE", "SUSPENDED", "OFFBOARDED"]).default("ACTIVE"),
});

export type DfspInsert = z.infer<typeof dfspInsertSchema>;

// ─── Settlement Windows ───────────────────────────────────────────────────────

export const settlementWindowInsertSchema = createInsertSchema(settlementWindows, {
  windowType: z.string().min(1),
  status: z.enum(["OPEN", "CLOSED", "SETTLED", "ABORTED"]).default("OPEN"),
  currency: z.string().length(3).default("NGN"),
});

export type SettlementWindowInsert = z.infer<typeof settlementWindowInsertSchema>;

// ─── Reconciliation Exceptions ────────────────────────────────────────────────

export const reconciliationExceptionInsertSchema = createInsertSchema(reconciliationExceptions, {
  windowId: z.string().min(1),
  transferId: z.string().optional(),
  breakType: z.string().min(1),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  status: z.enum(["OPEN", "RESOLVED", "ESCALATED"]).default("OPEN"),
});

export type ReconciliationExceptionInsert = z.infer<typeof reconciliationExceptionInsertSchema>;

// ─── Security Events ──────────────────────────────────────────────────────────

export const securityEventInsertSchema = createInsertSchema(nexthubSecurityEvents, {
  eventType: z.string().min(1),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  description: z.string().min(5),
  acknowledged: z.boolean().default(false),
});

export type SecurityEventInsert = z.infer<typeof securityEventInsertSchema>;

// ─── AML Rules ────────────────────────────────────────────────────────────────

export const amlRuleInsertSchema = createInsertSchema(amlRules, {
  ruleName: z.string().min(2).max(128),
  ruleCategory: z.string().min(1),
  isEnabled: z.boolean().default(true),
});

export type AmlRuleInsert = z.infer<typeof amlRuleInsertSchema>;

// ─── Bulk Transfers ───────────────────────────────────────────────────────────

export const bulkTransferInsertSchema = createInsertSchema(nexthubBulkTransfers, {
  bulkTransferId: z.string().min(1).max(64),
  payerFsp: z.string().min(1).max(64),
  payeeFsp: z.string().min(1).max(64),
  totalTransfers: z.number().int().positive(),
  state: z.enum(["RECEIVED", "PROCESSING", "COMPLETED", "FAILED", "ABORTED"]).default("RECEIVED"),
});

export type BulkTransferInsert = z.infer<typeof bulkTransferInsertSchema>;

// ─── Oracles ──────────────────────────────────────────────────────────────────

export const oracleInsertSchema = createInsertSchema(nexthubOracles, {
  oracleId: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  partyIdType: z.string().min(1),
  endpoint: z.string().url(),
  isActive: z.number().int().min(0).max(1).default(1),
});

export type OracleInsert = z.infer<typeof oracleInsertSchema>;

// ─── Fee Postings ─────────────────────────────────────────────────────────────

export const feePostingInsertSchema = createInsertSchema(feePostings, {
  transferId: z.string().min(1),
  dfspId: z.string().min(1),
  feeType: z.string().min(1),
  feeCategory: z.enum(["DEBIT", "CREDIT"]).default("DEBIT"),
  amountKobo: z.number().int().positive(),
  currency: z.string().length(3).default("NGN"),
});

export type FeePostingInsert = z.infer<typeof feePostingInsertSchema>;

// ─── DFSP Fee Tiers ───────────────────────────────────────────────────────────

export const dfspFeeTierInsertSchema = createInsertSchema(dfspFeeTiers, {
  dfspId: z.string().min(1),
  feeType: z.string().min(1),
  tierModel: z.enum(["flat", "percentage", "tiered"]).default("flat"),
});

export type DfspFeeTierInsert = z.infer<typeof dfspFeeTierInsertSchema>;

// ─── Type guards ──────────────────────────────────────────────────────────────

export function isParticipant(value: unknown): value is ParticipantSelect {
  return participantSelectSchema.safeParse(value).success;
}

export function isTransfer(value: unknown): value is TransferSelect {
  return transferSelectSchema.safeParse(value).success;
}
