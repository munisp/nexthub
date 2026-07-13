/**
 * nexthub_schema.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Database schema for NextHub — the central payment switch, settlement engine,
 * scheme billing layer, and regulatory oversight portal.
 *
 * This schema is independent of the Paygate DFSP schema.
 * Tables here are owned exclusively by the NextHub service.
 */
import { pgTable, text, integer, real, boolean, timestamp, jsonb, serial, varchar, bigint, doublePrecision, index, primaryKey, uniqueIndex } from "drizzle-orm/pg-core";

// ═══════════════════════════════════════════════════════════════════════════════
// NEXTHUB SRBE — Settlement, Reconciliation, and Billing Engine
// ═══════════════════════════════════════════════════════════════════════════════

export const settlementWindows = pgTable("settlement_windows", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  windowType: text("window_type").notNull(),
  status: text("status").notNull().default("OPEN"),
  currency: text("currency").notNull().default("NGN"),
  openedAt: timestamp("opened_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
  settledAt: timestamp("settled_at"),
  totalTransfers: integer("total_transfers").notNull().default(0),
  totalAmountKobo: bigint("total_amount_kobo", { mode: "number" }).notNull().default(0),
  settlementReportUrl: text("settlement_report_url"),
  railReference: text("rail_reference"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type SettlementWindow = typeof settlementWindows.$inferSelect;
export type InsertSettlementWindow = typeof settlementWindows.$inferInsert;

export const settlementNetPositions = pgTable("settlement_net_positions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  windowId: text("window_id").notNull().references(() => settlementWindows.id),
  dfspId: text("dfsp_id").notNull(),
  dfspName: text("dfsp_name").notNull(),
  currency: text("currency").notNull().default("NGN"),
  netPositionKobo: bigint("net_position_kobo", { mode: "number" }).notNull().default(0),
  totalDebitsKobo: bigint("total_debits_kobo", { mode: "number" }).notNull().default(0),
  totalCreditsKobo: bigint("total_credits_kobo", { mode: "number" }).notNull().default(0),
  transferCount: integer("transfer_count").notNull().default(0),
  tigerBeetleAccountId: text("tigerbeetle_account_id"),
  settlementInstruction: text("settlement_instruction"),
  settledAt: timestamp("settled_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type SettlementNetPosition = typeof settlementNetPositions.$inferSelect;

export const nexthubDfsps = pgTable("nexthub_dfsps", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  dfspId: text("dfsp_id").notNull().unique(),
  dfspName: text("dfsp_name").notNull(),
  dfspType: text("dfsp_type").notNull().default("bank"),
  country: text("country").notNull().default("NG"),
  currency: text("currency").notNull().default("NGN"),
  status: text("status").notNull().default("ACTIVE"),
  tigerBeetlePositionAccountId: text("tigerbeetle_position_account_id"),
  tigerBeetleLiquidityAccountId: text("tigerbeetle_liquidity_account_id"),
  liquidityLimitKobo: bigint("liquidity_limit_kobo", { mode: "number" }).notNull().default(0),
  callbackUrl: text("callback_url"),
  clientCertificateThumbprint: text("client_certificate_thumbprint"),
  certificateExpiresAt: timestamp("certificate_expires_at"),
  onboardedAt: timestamp("onboarded_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type NexthubDfsp = typeof nexthubDfsps.$inferSelect;
export type InsertNexthubDfsp = typeof nexthubDfsps.$inferInsert;

export const feePostings = pgTable("fee_postings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  transferId: text("transfer_id").notNull(),
  windowId: text("window_id"),
  dfspId: text("dfsp_id").notNull(),
  feeType: text("fee_type").notNull(),
  feeCategory: text("fee_category").notNull().default("DEBIT"),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("NGN"),
  tigerBeetleTransferId: text("tigerbeetle_transfer_id"),
  billedAt: timestamp("billed_at"),
  invoiceId: text("invoice_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type FeePosting = typeof feePostings.$inferSelect;

export const dfspFeeTiers = pgTable("dfsp_fee_tiers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  dfspId: text("dfsp_id").notNull(),
  feeType: text("fee_type").notNull(),
  tierModel: text("tier_model").notNull().default("flat"),
  flatRateBps: integer("flat_rate_bps"),
  minFeeKobo: integer("min_fee_kobo"),
  maxFeeKobo: integer("max_fee_kobo"),
  tierBands: text("tier_bands"),
  volumeDiscountBands: text("volume_discount_bands"),
  effectiveFrom: timestamp("effective_from").notNull().defaultNow(),
  effectiveTo: timestamp("effective_to"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type DfspFeeTier = typeof dfspFeeTiers.$inferSelect;

export const nexthubInvoices = pgTable("nexthub_invoices", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  dfspId: text("dfsp_id").notNull(),
  dfspName: text("dfsp_name").notNull(),
  billingPeriodStart: timestamp("billing_period_start").notNull(),
  billingPeriodEnd: timestamp("billing_period_end").notNull(),
  totalSchemeFeesKobo: bigint("total_scheme_fees_kobo", { mode: "number" }).notNull().default(0),
  totalInterchangeKobo: bigint("total_interchange_kobo", { mode: "number" }).notNull().default(0),
  totalFxMarkupKobo: bigint("total_fx_markup_kobo", { mode: "number" }).notNull().default(0),
  totalPenaltiesKobo: bigint("total_penalties_kobo", { mode: "number" }).notNull().default(0),
  totalAmountKobo: bigint("total_amount_kobo", { mode: "number" }).notNull().default(0),
  currency: text("currency").notNull().default("NGN"),
  status: text("status").notNull().default("DRAFT"),
  pdfUrl: text("pdf_url"),
  tigerBeetleInvoiceTransferId: text("tigerbeetle_invoice_transfer_id"),
  issuedAt: timestamp("issued_at"),
  dueAt: timestamp("due_at"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type NexthubInvoice = typeof nexthubInvoices.$inferSelect;

export const reconciliationExceptions = pgTable("reconciliation_exceptions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  windowId: text("window_id").notNull(),
  transferId: text("transfer_id"),
  dfspId: text("dfsp_id"),
  breakType: text("break_type").notNull(),
  severity: text("severity").notNull().default("MEDIUM"),
  status: text("status").notNull().default("OPEN"),
  hubAmountKobo: bigint("hub_amount_kobo", { mode: "number" }),
  railAmountKobo: bigint("rail_amount_kobo", { mode: "number" }),
  discrepancyAmountKobo: bigint("discrepancy_amount_kobo", { mode: "number" }),
  currency: text("currency").notNull().default("NGN"),
  description: text("description"),
  resolutionNotes: text("resolution_notes"),
  autoResolveSlaMinutes: integer("auto_resolve_sla_minutes"),
  resolvedAt: timestamp("resolved_at"),
  escalatedAt: timestamp("escalated_at"),
  assignedTo: text("assigned_to"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type ReconciliationException = typeof reconciliationExceptions.$inferSelect;

export const transferDisputes = pgTable("transfer_disputes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  transferId: text("transfer_id").notNull(),
  initiatedByDfspId: text("initiated_by_dfsp_id").notNull(),
  respondingDfspId: text("responding_dfsp_id"),
  disputeType: text("dispute_type").notNull(),
  status: text("status").notNull().default("OPEN"),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("NGN"),
  reason: text("reason").notNull(),
  evidence: text("evidence"),
  resolution: text("resolution"),
  resolutionNotes: text("resolution_notes"),
  penaltyAmountKobo: bigint("penalty_amount_kobo", { mode: "number" }).default(0),
  reversalTransferId: text("reversal_transfer_id"),
  tigerBeetlePenaltyTransferId: text("tigerbeetle_penalty_transfer_id"),
  slaDeadline: timestamp("sla_deadline"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type TransferDispute = typeof transferDisputes.$inferSelect;

export const nexthubTransfers = pgTable("nexthub_transfers", {
  id: text("id").primaryKey(),
  payerFspId: text("payer_fsp_id").notNull(),
  payeeFspId: text("payee_fsp_id").notNull(),
  payerPartyId: text("payer_party_id").notNull(),
  payeePartyId: text("payee_party_id").notNull(),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("NGN"),
  state: text("state").notNull().default("RECEIVED"),
  ilpPacket: text("ilp_packet"),
  condition: text("condition"),
  fulfilment: text("fulfilment"),
  fraudScore: real("fraud_score"),
  schemeFeeKobo: bigint("scheme_fee_kobo", { mode: "number" }).default(0),
  interchangeFeeKobo: bigint("interchange_fee_kobo", { mode: "number" }).default(0),
  fxRate: real("fx_rate"),
  tigerBeetleTransferId: text("tigerbeetle_transfer_id"),
  tigerBeetleFeeId: text("tigerbeetle_fee_id"),
  windowId: text("window_id"),
  expirationTime: timestamp("expiration_time"),
  errorCode: text("error_code"),
  errorDescription: text("error_description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type NexthubTransfer = typeof nexthubTransfers.$inferSelect;

export const nexthubSecurityEvents = pgTable("nexthub_security_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  eventType: text("event_type").notNull(),
  severity: text("severity").notNull().default("MEDIUM"),
  dfspId: text("dfsp_id"),
  sourceIp: text("source_ip"),
  description: text("description").notNull(),
  metadata: text("metadata"),
  acknowledged: boolean("acknowledged").notNull().default(false),
  acknowledgedBy: text("acknowledged_by"),
  acknowledgedAt: timestamp("acknowledged_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type NexthubSecurityEvent = typeof nexthubSecurityEvents.$inferSelect;

export const amlRules = pgTable("aml_rules", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  ruleName: text("rule_name").notNull().unique(),
  ruleCategory: text("rule_category").notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  parameters: text("parameters").notNull(),
  action: text("action").notNull().default("FLAG"),
  effectiveFrom: timestamp("effective_from").notNull().defaultNow(),
  effectiveTo: timestamp("effective_to"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type AmlRule = typeof amlRules.$inferSelect;

// ─── NIP Name Enquiry Cache ────────────────────────────────────────────────────
export const nipNameEnquiryCache = pgTable("nip_name_enquiry_cache", {
  id: serial("id").primaryKey(),
  bankNipCode: text("bank_nip_code").notNull(),
  accountNumber: text("account_number").notNull(),
  accountName: text("account_name").notNull(),
  bankVerificationNumber: text("bank_verification_number"),
  kycLevel: text("kyc_level"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("nip_name_enquiry_cache_key_idx").on(t.bankNipCode, t.accountNumber),
  index("nip_name_enquiry_cache_expires_idx").on(t.expiresAt),
]);
export type NipNameEnquiryCache = typeof nipNameEnquiryCache.$inferSelect;

// ─── NIP Virtual Accounts ─────────────────────────────────────────────────────
export const nipVirtualAccounts = pgTable("nip_virtual_accounts", {
  id: serial("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  paymentLinkId: text("payment_link_id"),
  checkoutSessionId: text("checkout_session_id"),
  bankNipCode: text("bank_nip_code").notNull(),
  bankName: text("bank_name").notNull(),
  accountNumber: text("account_number").notNull(),
  accountName: text("account_name").notNull(),
  amountExpected: integer("amount_expected"),
  currency: text("currency").notNull().default("NGN"),
  reference: text("reference").notNull().unique(),
  status: text("status").notNull().default("pending"),
  paidAt: timestamp("paid_at"),
  paidAmount: integer("paid_amount"),
  nibssReference: text("nibss_reference"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("nip_va_merchant_idx").on(t.merchantId),
  index("nip_va_reference_idx").on(t.reference),
  index("nip_va_status_idx").on(t.status),
  index("nip_va_expires_idx").on(t.expiresAt),
]);
export type NipVirtualAccount = typeof nipVirtualAccounts.$inferSelect;

// ============================================================
// VELOCITY LIMIT CONFIGS — Wave 210
// ============================================================
export const velocityLimitConfigs = pgTable("velocity_limit_configs", {
  id: serial("id").primaryKey(),
  merchantId: varchar("merchant_id", { length: 64 }),
  channel: varchar("channel", { length: 32 }).notNull().default("all"),
  limitType: varchar("limit_type", { length: 16 }).notNull().default("count"), // "count" | "amount"
  maxValue: integer("max_value").notNull(),
  windowSeconds: integer("window_seconds").notNull().default(3600),
  isActive: integer("is_active").notNull().default(1),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("vlc_merchant_channel_idx").on(t.merchantId, t.channel),
  index("vlc_active_idx").on(t.isActive),
]);
export type VelocityLimitConfig = typeof velocityLimitConfigs.$inferSelect;

export const velocityBreaches = pgTable("velocity_breaches", {
  id: serial("id").primaryKey(),
  limitConfigId: integer("limit_config_id").notNull(),
  merchantId: varchar("merchant_id", { length: 64 }).notNull(),
  channel: varchar("channel", { length: 32 }).notNull(),
  amountKobo: integer("amount_kobo").notNull().default(0),
  userId: integer("user_id").notNull().default(0),
  details: text("details"),
  breachedAt: timestamp("breached_at").defaultNow(),
}, (t) => [
  index("vb_merchant_idx").on(t.merchantId),
  index("vb_breached_at_idx").on(t.breachedAt),
]);
export type VelocityBreach = typeof velocityBreaches.$inferSelect;

// ============================================================
// NEXTHUB BULK TRANSFERS — Wave 210
// ============================================================
export const nexthubBulkTransfers = pgTable("nexthub_bulk_transfers", {
  id: serial("id").primaryKey(),
  bulkTransferId: varchar("bulk_transfer_id", { length: 64 }).notNull().unique(),
  bulkQuoteId: varchar("bulk_quote_id", { length: 64 }),
  payerFsp: varchar("payer_fsp", { length: 64 }).notNull(),
  payeeFsp: varchar("payee_fsp", { length: 64 }).notNull(),
  state: varchar("state", { length: 32 }).notNull().default("RECEIVED"),
  totalTransfers: integer("total_transfers").notNull().default(0),
  completedTransfers: integer("completed_transfers").notNull().default(0),
  failedTransfers: integer("failed_transfers").notNull().default(0),
  expiration: timestamp("expiration"),
  completedAt: timestamp("completed_at"),
  errorCode: varchar("error_code", { length: 8 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("nbt_state_idx").on(t.state),
  index("nbt_payer_idx").on(t.payerFsp),
  index("nbt_created_idx").on(t.createdAt),
]);
export type NexhubBulkTransfer = typeof nexthubBulkTransfers.$inferSelect;

// ============================================================
// NEXTHUB ORACLES — Wave 210
// ============================================================
export const nexthubOracles = pgTable("nexthub_oracles", {
  id: serial("id").primaryKey(),
  oracleId: varchar("oracle_id", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  partyIdType: varchar("party_id_type", { length: 32 }).notNull(), // MSISDN, IBAN, BVN, EMAIL, ALIAS
  currency: varchar("currency", { length: 8 }),
  endpoint: varchar("endpoint", { length: 512 }).notNull(),
  isDefault: integer("is_default").notNull().default(0),
  isActive: integer("is_active").notNull().default(1),
  healthStatus: varchar("health_status", { length: 16 }).notNull().default("UNKNOWN"),
  lastHealthCheck: timestamp("last_health_check"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("no_party_id_type_idx").on(t.partyIdType),
  index("no_active_idx").on(t.isActive),
]);
export type NexhubOracle = typeof nexthubOracles.$inferSelect;

// ============================================================
// NEXTHUB FX RATES — Wave 210
// ============================================================
export const nexthubFxRates = pgTable("nexthub_fx_rates", {
  id: serial("id").primaryKey(),
  sourceCurrency: varchar("source_currency", { length: 8 }).notNull(),
  targetCurrency: varchar("target_currency", { length: 8 }).notNull(),
  rate: varchar("rate", { length: 32 }).notNull(), // stored as string to avoid float precision issues
  provider: varchar("provider", { length: 64 }).notNull().default("nexthub-fx"),
  validFrom: timestamp("valid_from").notNull(),
  validTo: timestamp("valid_to").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("nfr_pair_idx").on(t.sourceCurrency, t.targetCurrency),
  index("nfr_valid_idx").on(t.validFrom, t.validTo),
]);
export type NexhubFxRate = typeof nexthubFxRates.$inferSelect;

// ============================================================
// NEXTHUB PISP CONSENTS — Wave 210
// ============================================================
export const nexthubPispConsents = pgTable("nexthub_pisp_consents", {
  id: serial("id").primaryKey(),
  consentId: varchar("consent_id", { length: 64 }).notNull().unique(),
  consentRequestId: varchar("consent_request_id", { length: 64 }),
  consumerId: varchar("consumer_id", { length: 64 }).notNull().default(""),
  pispId: varchar("pisp_id", { length: 64 }).notNull(),
  dfspId: varchar("dfsp_id", { length: 64 }).notNull(),
  // 'state' is the canonical FSPIOP term; 'status' is kept as alias
  state: varchar("state", { length: 32 }).notNull().default("REQUESTED"), // REQUESTED, GRANTED, ACTIVE, REVOKED, EXPIRED
  scopes: text("scopes").notNull().default("[]"), // JSON array of scope strings
  authChannels: text("auth_channels").default("[]"), // WEB, OTP
  credential: text("credential"), // FIDO2 credential JSON
  expiresAt: timestamp("expires_at"),
  revokedAt: timestamp("revoked_at"),
  revokeReason: varchar("revoke_reason", { length: 128 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("npc_consumer_idx").on(t.consumerId),
  index("npc_pisp_idx").on(t.pispId),
  index("npc_state_idx").on(t.state),
]);
export type NexhubPispConsent = typeof nexthubPispConsents.$inferSelect;

// ─── Wave 211: Remittance Corridors ──────────────────────────────────────────

export const remittanceCorridors = pgTable("remittance_corridors", {
  id: varchar("id", { length: 64 }).primaryKey(),
  fromCurrency: varchar("from_currency", { length: 8 }).notNull(),
  toCurrency: varchar("to_currency", { length: 8 }).notNull(),
  fromCountry: varchar("from_country", { length: 4 }).notNull(),
  toCountry: varchar("to_country", { length: 4 }).notNull(),
  exchangeRate: doublePrecision("exchange_rate").notNull(),
  fee: doublePrecision("fee").notNull().default(0),
  feeType: varchar("fee_type", { length: 16 }).notNull().default("FLAT"),
  minAmount: doublePrecision("min_amount").notNull().default(100),
  maxAmount: doublePrecision("max_amount").notNull().default(5000000),
  provider: varchar("provider", { length: 64 }).notNull(),
  isActive: integer("is_active").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("rc_from_to_idx").on(t.fromCurrency, t.toCurrency),
  index("rc_active_idx").on(t.isActive),
]);

export const remittanceTransfers = pgTable("remittance_transfers", {
  id: varchar("id", { length: 64 }).primaryKey(),
  corridorId: varchar("corridor_id", { length: 64 }).notNull(),
  senderFsp: varchar("sender_fsp", { length: 64 }).notNull(),
  senderAccount: varchar("sender_account", { length: 64 }).notNull(),
  receiverFsp: varchar("receiver_fsp", { length: 64 }).notNull(),
  receiverAccount: varchar("receiver_account", { length: 64 }).notNull(),
  sendAmount: doublePrecision("send_amount").notNull(),
  sendCurrency: varchar("send_currency", { length: 8 }).notNull(),
  receiveAmount: doublePrecision("receive_amount"),
  receiveCurrency: varchar("receive_currency", { length: 8 }),
  exchangeRate: doublePrecision("exchange_rate"),
  fee: doublePrecision("fee"),
  receiverName: varchar("receiver_name", { length: 128 }).notNull(),
  narration: varchar("narration", { length: 256 }),
  status: varchar("status", { length: 32 }).notNull().default("INITIATED"),
  railRef: varchar("rail_ref", { length: 128 }),
  travelRuleRef: varchar("travel_rule_ref", { length: 128 }),
  riskScore: integer("risk_score"),
  createdBy: varchar("created_by", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow(),
  settledAt: timestamp("settled_at"),
}, (t) => [
  index("rt_status_idx").on(t.status),
  index("rt_corridor_idx").on(t.corridorId),
]);

// ─── Wave 212: Healthcare Claims ─────────────────────────────────────────────

export const healthcareClaims = pgTable("healthcare_claims", {
  id: varchar("id", { length: 64 }).primaryKey(),
  policyNumber: varchar("policy_number", { length: 64 }).notNull(),
  beneficiaryId: varchar("beneficiary_id", { length: 64 }).notNull(),
  beneficiaryName: varchar("beneficiary_name", { length: 128 }).notNull(),
  providerId: varchar("provider_id", { length: 64 }).notNull(),
  providerName: varchar("provider_name", { length: 128 }).notNull(),
  claimType: varchar("claim_type", { length: 32 }).notNull(),
  diagnosisCodes: text("diagnosis_codes").notNull().default("[]"),
  procedureCodes: text("procedure_codes").notNull().default("[]"),
  claimAmount: doublePrecision("claim_amount").notNull(),
  approvedAmount: doublePrecision("approved_amount"),
  currency: varchar("currency", { length: 8 }).notNull().default("NGN"),
  serviceDate: varchar("service_date", { length: 16 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("SUBMITTED"),
  nhiaClaimRef: varchar("nhia_claim_ref", { length: 128 }),
  adjudicationNotes: text("adjudication_notes"),
  submittedBy: varchar("submitted_by", { length: 64 }),
  submittedAt: timestamp("submitted_at").defaultNow(),
  adjudicatedAt: timestamp("adjudicated_at"),
  paidAt: timestamp("paid_at"),
}, (t) => [
  index("hc_status_idx").on(t.status),
  index("hc_policy_idx").on(t.policyNumber),
  index("hc_provider_idx").on(t.providerId),
]);

// ─── Wave 213: Insurance Premium Payments ─────────────────────────────────────

export const insurancePremiumPayments = pgTable("insurance_premium_payments", {
  id: varchar("id", { length: 64 }).primaryKey(),
  policyId: varchar("policy_id", { length: 64 }).notNull(),
  policyNumber: varchar("policy_number", { length: 64 }).notNull(),
  amount: doublePrecision("amount").notNull(),
  currency: varchar("currency", { length: 8 }).notNull().default("NGN"),
  dueDate: varchar("due_date", { length: 16 }).notNull(),
  paidAt: timestamp("paid_at"),
  transferRef: varchar("transfer_ref", { length: 128 }),
  status: varchar("status", { length: 32 }).notNull().default("PENDING"),
  retryCount: integer("retry_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("ipp_policy_idx").on(t.policyId),
  index("ipp_status_idx").on(t.status),
  index("ipp_due_date_idx").on(t.dueDate),
]);

// ─── Wave 214: Supply Chain Finance ──────────────────────────────────────────

export const scfInvoices = pgTable("scf_invoices", {
  id: varchar("id", { length: 64 }).primaryKey(),
  tokenId: varchar("token_id", { length: 64 }).notNull(),
  invoiceNumber: varchar("invoice_number", { length: 64 }).notNull(),
  supplierId: varchar("supplier_id", { length: 64 }).notNull(),
  supplierFsp: varchar("supplier_fsp", { length: 64 }).notNull(),
  supplierAccount: varchar("supplier_account", { length: 64 }).notNull(),
  buyerId: varchar("buyer_id", { length: 64 }).notNull(),
  buyerFsp: varchar("buyer_fsp", { length: 64 }).notNull(),
  buyerAccount: varchar("buyer_account", { length: 64 }).notNull(),
  amount: doublePrecision("amount").notNull(),
  currency: varchar("currency", { length: 8 }).notNull().default("NGN"),
  dueDate: varchar("due_date", { length: 16 }).notNull(),
  discountRate: doublePrecision("discount_rate"),
  discountAmount: doublePrecision("discount_amount"),
  netAmount: doublePrecision("net_amount"),
  status: varchar("status", { length: 32 }).notNull().default("SUBMITTED"),
  transferRef: varchar("transfer_ref", { length: 128 }),
  createdBy: varchar("created_by", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow(),
  paidAt: timestamp("paid_at"),
}, (t) => [
  index("scf_status_idx").on(t.status),
  index("scf_supplier_idx").on(t.supplierId),
  index("scf_buyer_idx").on(t.buyerId),
]);

// ─── Wave 215: G2P Disbursements ─────────────────────────────────────────────

export const g2pDisbursementBatches = pgTable("g2p_disbursement_batches", {
  id: varchar("id", { length: 64 }).primaryKey(),
  programType: varchar("program_type", { length: 32 }).notNull(),
  programId: varchar("program_id", { length: 64 }).notNull(),
  payerFsp: varchar("payer_fsp", { length: 64 }).notNull(),
  payerAccount: varchar("payer_account", { length: 64 }).notNull(),
  amount: doublePrecision("amount").notNull(),
  currency: varchar("currency", { length: 8 }).notNull().default("NGN"),
  totalAmount: doublePrecision("total_amount").notNull(),
  beneficiaryCount: integer("beneficiary_count").notNull(),
  disbursedCount: integer("disbursed_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  status: varchar("status", { length: 32 }).notNull().default("PENDING"),
  scheduledAt: timestamp("scheduled_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdBy: varchar("created_by", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("g2p_program_idx").on(t.programType),
  index("g2p_status_idx").on(t.status),
]);

// ─── Wave 216: Energy / VEND ──────────────────────────────────────────────────

export const energyVendTransactions = pgTable("energy_vend_transactions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  meterNumber: varchar("meter_number", { length: 32 }).notNull(),
  disco: varchar("disco", { length: 16 }).notNull(),
  amount: doublePrecision("amount").notNull(),
  currency: varchar("currency", { length: 8 }).notNull().default("NGN"),
  customerPhone: varchar("customer_phone", { length: 32 }).notNull(),
  customerFsp: varchar("customer_fsp", { length: 64 }).notNull(),
  customerAccount: varchar("customer_account", { length: 64 }).notNull(),
  token: varchar("token", { length: 24 }),
  units: doublePrecision("units"),
  transferRef: varchar("transfer_ref", { length: 128 }),
  discoRef: varchar("disco_ref", { length: 128 }),
  status: varchar("status", { length: 32 }).notNull().default("INITIATED"),
  errorCode: varchar("error_code", { length: 64 }),
  createdBy: varchar("created_by", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow(),
  vendedAt: timestamp("vended_at"),
}, (t) => [
  index("evt_meter_idx").on(t.meterNumber),
  index("evt_disco_idx").on(t.disco),
  index("evt_status_idx").on(t.status),
]);

// ─── Wave 217: CBDC ───────────────────────────────────────────────────────────

export const cbdcAccounts = pgTable("cbdc_accounts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  rail: varchar("rail", { length: 16 }).notNull(),
  walletId: varchar("wallet_id", { length: 128 }).notNull(),
  ownerId: varchar("owner_id", { length: 64 }).notNull(),
  ownerType: varchar("owner_type", { length: 32 }).notNull(),
  balance: doublePrecision("balance").notNull().default(0),
  currency: varchar("currency", { length: 8 }).notNull(),
  isActive: integer("is_active").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("cbdc_acc_rail_idx").on(t.rail),
  index("cbdc_acc_owner_idx").on(t.ownerId),
  index("cbdc_acc_wallet_idx").on(t.walletId),
]);

export const cbdcTransfers = pgTable("cbdc_transfers", {
  id: varchar("id", { length: 64 }).primaryKey(),
  rail: varchar("rail", { length: 16 }).notNull(),
  senderWallet: varchar("sender_wallet", { length: 128 }).notNull(),
  receiverWallet: varchar("receiver_wallet", { length: 128 }).notNull(),
  amount: doublePrecision("amount").notNull(),
  currency: varchar("currency", { length: 8 }).notNull(),
  narration: varchar("narration", { length: 256 }),
  status: varchar("status", { length: 32 }).notNull().default("INITIATED"),
  railRef: varchar("rail_ref", { length: 128 }),
  tigerBeetleRef: varchar("tiger_beetle_ref", { length: 128 }),
  createdBy: varchar("created_by", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow(),
  settledAt: timestamp("settled_at"),
}, (t) => [
  index("cbdc_tx_rail_idx").on(t.rail),
  index("cbdc_tx_status_idx").on(t.status),
]);

// ── Wave 220: Participant Limits, Positions, Liquidity Windows ─────────────
export const nexthubParticipants = pgTable("nexthub_participants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  dfspId: text("dfsp_id").notNull().unique(),
  currency: text("currency").notNull().default("NGN"),
  status: text("status").notNull().default("PENDING"),
  schemeType: text("scheme_type").notNull().default("FSPIOP"),
  endpointUrl: text("endpoint_url").notNull(),
  tigerBeetlePositionAccountId: text("tigerbeetle_position_account_id"),
  tigerBeetleLiquidityAccountId: text("tigerbeetle_liquidity_account_id"),
  tigerBeetleLedger: integer("tigerbeetle_ledger").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const nexthubParticipantLimits = pgTable("nexthub_participant_limits", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  participantId: text("participant_id").notNull(),
  currency: text("currency").notNull().default("NGN"),
  netDebitCap: bigint("net_debit_cap", { mode: "number" }).notNull(),
  liquidityCover: bigint("liquidity_cover", { mode: "number" }).notNull().default(0),
  positionLimit: bigint("position_limit", { mode: "number" }),
  alertThreshold: doublePrecision("alert_threshold").notNull().default(0.8),
  suspendOnBreach: boolean("suspend_on_breach").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: text("updated_by"),
});

export const nexthubParticipantPositions = pgTable("nexthub_participant_positions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  participantId: text("participant_id").notNull(),
  currency: text("currency").notNull().default("NGN"),
  currentValue: bigint("current_value", { mode: "number" }).notNull().default(0),
  reservedValue: bigint("reserved_value", { mode: "number" }).notNull().default(0),
  availableValue: bigint("available_value", { mode: "number" }).notNull().default(0),
  ndcUtilisation: doublePrecision("ndc_utilisation").notNull().default(0),
  positionStatus: text("position_status").notNull().default("OK"),
  lastTransferId: text("last_transfer_id"),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

export const nexthubLiquidityWindows = pgTable("nexthub_liquidity_windows", {
  windowId: text("window_id").primaryKey(),
  participantId: text("participant_id").notNull(),
  currency: text("currency").notNull().default("NGN"),
  amount: bigint("amount", { mode: "number" }).notNull(),
  openedAt: timestamp("opened_at").defaultNow(),
  closesAt: timestamp("closes_at").notNull(),
  status: text("status").notNull().default("OPEN"),
});

// ── Wave 221: Developer API Keys ─────────────────────────────────────────────
export const developerApiKeys = pgTable("developer_api_keys", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  name: text("name").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  keyHash: text("key_hash").notNull(),
  environment: text("environment").notNull().default("test"),
  scopes: text("scopes").notNull().default("[]"),
  isActive: boolean("is_active").notNull().default(true),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ── Wave 221: Developer Webhooks ──────────────────────────────────────────────
export const developerWebhooks = pgTable("developer_webhooks", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  url: text("url").notNull(),
  description: text("description"),
  events: text("events").notNull().default("[]"),
  signingSecret: text("signing_secret").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  retryPolicy: text("retry_policy").notNull().default("exponential"),
  maxRetries: integer("max_retries").notNull().default(3),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ── Wave 221: Developer Webhook Deliveries ────────────────────────────────────
export const developerWebhookDeliveries = pgTable("developer_webhook_deliveries", {
  id: text("id").primaryKey(),
  webhookId: text("webhook_id").notNull(),
  merchantId: text("merchant_id").notNull(),
  eventType: text("event_type").notNull(),
  eventId: text("event_id"),
  payload: text("payload").notNull(),
  responseStatus: integer("response_status"),
  responseBody: text("response_body"),
  durationMs: integer("duration_ms"),
  attempt: integer("attempt").notNull().default(1),
  status: text("status").notNull().default("pending"),
  nextRetryAt: timestamp("next_retry_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Wave 221: Domain Health Snapshots ─────────────────────────────────────────
export const domainHealthSnapshots = pgTable("domain_health_snapshots", {
  id: text("id").primaryKey(),
  domain: text("domain").notNull(),
  tps: doublePrecision("tps").notNull().default(0),
  errorRate: doublePrecision("error_rate").notNull().default(0),
  p50LatencyMs: integer("p50_latency_ms").notNull().default(0),
  p95LatencyMs: integer("p95_latency_ms").notNull().default(0),
  p99LatencyMs: integer("p99_latency_ms").notNull().default(0),
  uptime: doublePrecision("uptime").notNull().default(100),
  activeConnections: integer("active_connections").notNull().default(0),
  queueDepth: integer("queue_depth").notNull().default(0),
  status: text("status").notNull().default("healthy"),
  snapshotAt: timestamp("snapshot_at").defaultNow(),
});

// ── Wave 221: Saga Instances ──────────────────────────────────────────────────
export const sagaInstances = pgTable("saga_instances", {
  id: text("id").primaryKey(),
  sagaType: text("saga_type").notNull(),
  merchantId: text("merchant_id").notNull(),
  status: text("status").notNull().default("running"),
  currentStep: integer("current_step").notNull().default(0),
  totalSteps: integer("total_steps").notNull().default(5),
  steps: jsonb("steps").notNull().default([]),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata").default({}),
  // Wave 225 — Temporal wiring
  workflowId: text("workflow_id"),
  runId: text("run_id"),
});

// ── Wave 221: Nexthub Beneficiary Registry ────────────────────────────────────
export const nexthubBeneficiaryRegistry = pgTable("nexthub_beneficiary_registry", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  fullName: text("full_name").notNull(),
  nin: text("nin"),
  bvn: text("bvn"),
  phone: text("phone"),
  email: text("email"),
  bankAccount: text("bank_account"),
  bankCode: text("bank_code"),
  domains: text("domains").notNull().default("[]"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ── Wave 221: Domain Quotas ───────────────────────────────────────────────────
export const nexthubDomainQuotas = pgTable("nexthub_domain_quotas", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  domain: text("domain").notNull(),
  dailyLimit: integer("daily_limit").notNull().default(10000),
  monthlyLimit: integer("monthly_limit").notNull().default(250000),
  currentDaily: integer("current_daily").notNull().default(0),
  currentMonthly: integer("current_monthly").notNull().default(0),
  rateLimitRpm: integer("rate_limit_rpm").notNull().default(120),
  status: text("status").notNull().default("active"),
  resetAt: timestamp("reset_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Wave 221: Cost Centres ────────────────────────────────────────────────────
export const costCentres = pgTable("cost_centres", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  domain: text("domain"),
  budgetAmount: doublePrecision("budget_amount"),
  spentAmount: doublePrecision("spent_amount").notNull().default(0),
  currency: text("currency").notNull().default("NGN"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ── Wave 223: Onboarding & Production-Readiness Tables ───────────────────────

// Settlement Banks registry
export const settlementBanks = pgTable("settlement_banks", {
  id: text("id").primaryKey(),
  bankCode: text("bank_code").notNull().unique(),
  bankName: text("bank_name").notNull(),
  nipCode: text("nip_code"),
  swiftCode: text("swift_code"),
  cbnLicenseNumber: text("cbn_license_number"),
  settlementAccountNumber: text("settlement_account_number"),
  settlementAccountName: text("settlement_account_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  status: text("status").notNull().default("active"),
  isRtgsEnabled: boolean("is_rtgs_enabled").notNull().default(false),
  isNipEnabled: boolean("is_nip_enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Nexthub Regulators (CBN, SEC, NDIC observers)
export const nexthubRegulators = pgTable("nexthub_regulators", {
  id: text("id").primaryKey(),
  regulatorCode: text("regulator_code").notNull().unique(),
  regulatorName: text("regulator_name").notNull(),
  jurisdiction: text("jurisdiction").notNull().default("NG"),
  regulatoryType: text("regulatory_type").notNull().default("central_bank"),
  contactEmail: text("contact_email"),
  reportingFrequency: text("reporting_frequency").notNull().default("daily"),
  dataAccessLevel: text("data_access_level").notNull().default("aggregate"),
  apiEndpoint: text("api_endpoint"),
  webhookUrl: text("webhook_url"),
  status: text("status").notNull().default("active"),
  onboardedAt: timestamp("onboarded_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// DFSP Onboarding Sessions (wizard state)
export const dfspOnboardingSessions = pgTable("dfsp_onboarding_sessions", {
  id: text("id").primaryKey(),
  dfspId: text("dfsp_id"),
  institutionName: text("institution_name").notNull(),
  institutionType: text("institution_type").notNull(),
  cbnLicenseNumber: text("cbn_license_number"),
  cbnLicenseDocUrl: text("cbn_license_doc_url"),
  contactEmail: text("contact_email").notNull(),
  contactPhone: text("contact_phone"),
  technicalContactEmail: text("technical_contact_email"),
  fspiopEndpoint: text("fspop_endpoint"),
  tlsCertUrl: text("tls_cert_url"),
  jwksUrl: text("jwks_url"),
  settlementAccountNumber: text("settlement_account_number"),
  settlementBankCode: text("settlement_bank_code"),
  currentStep: integer("current_step").notNull().default(1),
  totalSteps: integer("total_steps").notNull().default(6),
  status: text("status").notNull().default("draft"),
  submittedAt: timestamp("submitted_at"),
  approvedAt: timestamp("approved_at"),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// PISP Onboarding Sessions
export const pispOnboardingSessions = pgTable("pisp_onboarding_sessions", {
  id: text("id").primaryKey(),
  pispId: text("pisp_id"),
  companyName: text("company_name").notNull(),
  cbnLicenseNumber: text("cbn_license_number"),
  cbnLicenseDocUrl: text("cbn_license_doc_url"),
  contactEmail: text("contact_email").notNull(),
  redirectUrls: text("redirect_urls"),
  webhookUrl: text("webhook_url"),
  consentScopeRequested: text("consent_scope_requested"),
  businessDescription: text("business_description"),
  currentStep: integer("current_step").notNull().default(1),
  totalSteps: integer("total_steps").notNull().default(5),
  status: text("status").notNull().default("draft"),
  submittedAt: timestamp("submitted_at"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// PSP / Acquirer Onboarding Sessions
export const pspOnboardingSessions = pgTable("psp_onboarding_sessions", {
  id: text("id").primaryKey(),
  pspId: text("psp_id"),
  companyName: text("company_name").notNull(),
  pspType: text("psp_type").notNull().default("acquirer"),
  cbnLicenseNumber: text("cbn_license_number"),
  pcidssLevel: text("pcidss_level"),
  pcidssDocUrl: text("pcidss_doc_url"),
  contactEmail: text("contact_email").notNull(),
  settlementBankCode: text("settlement_bank_code"),
  merchantCategoryCodesAllowed: text("merchant_category_codes_allowed"),
  maxTransactionAmount: doublePrecision("max_transaction_amount"),
  currentStep: integer("current_step").notNull().default(1),
  totalSteps: integer("total_steps").notNull().default(5),
  status: text("status").notNull().default("draft"),
  submittedAt: timestamp("submitted_at"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// POS Operator Onboarding Sessions
export const posOperatorOnboardingSessions = pgTable("pos_operator_onboarding_sessions", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id"),
  operatorName: text("operator_name").notNull(),
  ptspCode: text("ptsp_code"),
  terminalCount: integer("terminal_count").notNull().default(1),
  deploymentLocations: text("deployment_locations"),
  nibssApprovalDocUrl: text("nibss_approval_doc_url"),
  contactEmail: text("contact_email").notNull(),
  contactPhone: text("contact_phone"),
  currentStep: integer("current_step").notNull().default(1),
  totalSteps: integer("total_steps").notNull().default(4),
  status: text("status").notNull().default("draft"),
  submittedAt: timestamp("submitted_at"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Compliance Check Results (for nightly automation job)
export const complianceCheckResults = pgTable("compliance_check_results", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  checkType: text("check_type").notNull(),
  checkName: text("check_name").notNull(),
  score: integer("score").notNull().default(0),
  maxScore: integer("max_score").notNull().default(100),
  status: text("status").notNull().default("pending"),
  findings: text("findings"),
  recommendations: text("recommendations"),
  evaluatedAt: timestamp("evaluated_at").defaultNow(),
  nextEvaluationAt: timestamp("next_evaluation_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Audit Logs
export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id"),
  userId: text("user_id"),
  action: text("action").notNull(),
  resource: text("resource").notNull(),
  resourceId: text("resource_id"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  requestBody: text("request_body"),
  responseStatus: integer("response_status"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const apiRateLimitRules = pgTable("api_rate_limit_rules", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  endpoint: text("endpoint").notNull(),
  limitPerMinute: integer("limit_per_minute").notNull().default(60),
  limitPerHour: integer("limit_per_hour").notNull().default(1000),
  limitPerDay: integer("limit_per_day").notNull().default(10000),
  burstLimit: integer("burst_limit").notNull().default(10),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ── Wave 225: Regulator Magic-Link Auth ───────────────────────────────────────
export const regulatorMagicTokens = pgTable("regulator_magic_tokens", {
  id: text("id").primaryKey(),
  regulatorId: text("regulator_id").notNull(),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const regulatorSessions = pgTable("regulator_sessions", {
  id: text("id").primaryKey(),
  regulatorId: text("regulator_id").notNull(),
  email: text("email").notNull(),
  sessionToken: text("session_token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Wave 227: Regulator Doc Upload + NDC Breach Events ───────────────────────
export const regulatorDocuments = pgTable("regulator_documents", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  regulatorId: text("regulator_id").notNull(),
  documentType: text("document_type").notNull(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  s3Key: text("s3_key").notNull(),
  status: text("status").notNull().default("pending_upload"),
  uploadedAt: timestamp("uploaded_at"),
  reviewedAt: timestamp("reviewed_at"),
  reviewNote: text("review_note"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const ndcBreachEvents = pgTable("ndc_breach_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  dfspId: text("dfsp_id").notNull(),
  dfspName: text("dfsp_name").notNull(),
  currentPositionKobo: integer("current_position_kobo").notNull(),
  ndcLimitKobo: integer("ndc_limit_kobo").notNull(),
  breachPercentage: real("breach_percentage").notNull(),
  severity: text("severity"),
  windowId: text("window_id"),
  resolvedAt: timestamp("resolved_at"),
  resolution: text("resolution"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const dfspNdcLimits = pgTable("dfsp_ndc_limits", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  dfspId: text("dfsp_id").notNull().unique(),
  dfspName: text("dfsp_name").notNull(),
  ndcLimitKobo: integer("ndc_limit_kobo").notNull().default(0),
  alertThresholdPct: real("alert_threshold_pct").notNull().default(80),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Re-exports from paygate schema (shared tables used by nexthub routers) ──
// These tables live in the paygate schema but are referenced by nexthub server
// code. Re-exporting them here keeps the import path consistent.
export {
  fxRates,
  kybDocuments,
  kybVerifications,
  posTerminals,
  realtimeNotificationPreferences,
  transactions,
} from "./schema";

// ── Wave 230: JWS Keys + mTLS Certificates ───────────────────────────────────
export const jwsKeys = pgTable("jws_keys", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  dfspId: text("dfsp_id").notNull(),
  algorithm: text("algorithm").notNull().default("PS256"),
  keyType: text("key_type").notNull().default("RSA"),
  publicKeyPem: text("public_key_pem").notNull(),
  privateKeyPem: text("private_key_pem"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
  revokedAt: timestamp("revoked_at"),
  revokedBy: text("revoked_by"),
});
export type JwsKey = typeof jwsKeys.$inferSelect;

export const mtlsCertificates = pgTable("mtls_certificates", {
  id: text("id").primaryKey(),
  dfspId: text("dfsp_id").notNull(),
  certType: text("cert_type").notNull(),
  commonName: text("common_name").notNull(),
  certificatePem: text("certificate_pem").notNull(),
  privateKeyPem: text("private_key_pem"),
  serialNumber: text("serial_number"),
  issuedAt: timestamp("issued_at").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  revokedAt: timestamp("revoked_at"),
  revocationReason: text("revocation_reason"),
});
export type MtlsCertificate = typeof mtlsCertificates.$inferSelect;

// ── Wave 240: Temporal Workflow Tracking ─────────────────────────────────────
export const temporalWorkflowInstances = pgTable("temporal_workflow_instances", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workflowId: text("workflow_id").notNull().unique(),
  runId: text("run_id"),
  workflowType: text("workflow_type").notNull(),
  status: text("status").notNull().default("RUNNING"),
  input: text("input"),
  result: text("result"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  entityId: text("entity_id"),
  entityType: text("entity_type"),
});
export type TemporalWorkflowInstance = typeof temporalWorkflowInstances.$inferSelect;

// ── Wave 250: Liquidity & Collateral ─────────────────────────────────────────
export const collateralDeposits = pgTable("collateral_deposits", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  dfspId: text("dfsp_id").notNull(),
  amountKobo: integer("amount_kobo").notNull(),
  currency: text("currency").notNull().default("NGN"),
  bankRef: text("bank_ref"),
  status: text("status").notNull().default("PENDING"),
  ledgerEntryId: text("ledger_entry_id"),
  workflowId: text("workflow_id"),
  confirmedAt: timestamp("confirmed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type CollateralDeposit = typeof collateralDeposits.$inferSelect;

export const liquidityAlerts = pgTable("liquidity_alerts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  dfspId: text("dfsp_id").notNull(),
  currency: text("currency").notNull().default("NGN"),
  positionKobo: integer("position_kobo").notNull(),
  ndcLimitKobo: integer("ndc_limit_kobo").notNull(),
  utilisationPct: real("utilisation_pct").notNull(),
  alertLevel: text("alert_level").notNull(),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type LiquidityAlert = typeof liquidityAlerts.$inferSelect;

export const settlementCorridors = pgTable("settlement_corridors", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  corridorId: text("corridor_id").notNull().unique(),
  sourceCurrency: text("source_currency").notNull(),
  targetCurrency: text("target_currency").notNull(),
  fxRate: real("fx_rate").notNull().default(1),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type SettlementCorridor = typeof settlementCorridors.$inferSelect;

// ── Wave 260: Audit Trail (Lakehouse sync) ────────────────────────────────────
export const auditTrailEvents = pgTable("audit_trail_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  eventType: text("event_type").notNull(),
  actorId: text("actor_id").notNull(),
  actorType: text("actor_type").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id").notNull(),
  action: text("action").notNull(),
  outcome: text("outcome").notNull(),
  metadata: text("metadata"),
  ipAddress: text("ip_address"),
  sessionId: text("session_id"),
  lakehouseSynced: boolean("lakehouse_synced").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});
export type AuditTrailEvent = typeof auditTrailEvents.$inferSelect;

// ── Infrastructure: APISIX Gateway Route Registry ────────────────────────────
export const apisixRoutes = pgTable("apisix_routes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  routeId: text("route_id").notNull().unique(),
  dfspId: text("dfsp_id"),
  name: text("name").notNull(),
  uri: text("uri").notNull(),
  methods: text("methods").array().notNull().default(["GET", "POST"]),
  upstreamUrl: text("upstream_url").notNull(),
  plugins: text("plugins"),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type ApisixRoute = typeof apisixRoutes.$inferSelect;

export const apisixConsumers = pgTable("apisix_consumers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  username: text("username").notNull().unique(),
  dfspId: text("dfsp_id"),
  plugins: text("plugins"),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type ApisixConsumer = typeof apisixConsumers.$inferSelect;

// ── Infrastructure: Dapr State & Pub/Sub Audit ────────────────────────────────
export const daprStateEntries = pgTable("dapr_state_entries", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  storeComponent: text("store_component").notNull().default("statestore"),
  stateKey: text("state_key").notNull(),
  etag: text("etag"),
  value: text("value"),
  ttlSeconds: integer("ttl_seconds"),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type DaprStateEntry = typeof daprStateEntries.$inferSelect;

export const daprPubSubEvents = pgTable("dapr_pubsub_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  pubsubComponent: text("pubsub_component").notNull().default("pubsub"),
  topic: text("topic").notNull(),
  eventType: text("event_type").notNull(),
  dataContentType: text("data_content_type").notNull().default("application/json"),
  data: text("data"),
  traceId: text("trace_id"),
  status: text("status").notNull().default("PUBLISHED"),
  publishedAt: timestamp("published_at").defaultNow(),
});
export type DaprPubSubEvent = typeof daprPubSubEvents.$inferSelect;

// ── Infrastructure: OpenAppSec WAF Policies & Alerts ─────────────────────────
export const openappsecPolicies = pgTable("openappsec_policies", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  policyId: text("policy_id").notNull().unique(),
  name: text("name").notNull(),
  mode: text("mode").notNull().default("prevent"),
  assetUrls: text("asset_urls").array().notNull().default([]),
  practiceConfig: text("practice_config"),
  trustedSources: text("trusted_sources"),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type OpenappsecPolicy = typeof openappsecPolicies.$inferSelect;

export const openappsecAlerts = pgTable("openappsec_alerts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  alertId: text("alert_id").notNull().unique(),
  policyId: text("policy_id"),
  severity: text("severity").notNull().default("medium"),
  attackType: text("attack_type").notNull(),
  sourceIp: text("source_ip"),
  targetUri: text("target_uri"),
  requestId: text("request_id"),
  payload: text("payload"),
  action: text("action").notNull().default("blocked"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type OpenappsecAlert = typeof openappsecAlerts.$inferSelect;

// ── Infrastructure: Fluvio Stream Topic Registry ──────────────────────────────
export const fluvioTopics = pgTable("fluvio_topics", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  topicName: text("topic_name").notNull().unique(),
  partitions: integer("partitions").notNull().default(1),
  retentionHours: integer("retention_hours").notNull().default(24),
  description: text("description"),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type FluvioTopic = typeof fluvioTopics.$inferSelect;

export const fluvioStreamEvents = pgTable("fluvio_stream_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  topic: text("topic").notNull(),
  partitionKey: text("partition_key"),
  payload: text("payload").notNull(),
  offset: integer("offset"),
  status: text("status").notNull().default("PUBLISHED"),
  publishedAt: timestamp("published_at").defaultNow(),
});
export type FluvioStreamEvent = typeof fluvioStreamEvents.$inferSelect;

// ── Infrastructure: Permify Policy Relationship Audit ─────────────────────────
export const permifyRelationships = pgTable("permify_relationships", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  relation: text("relation").notNull(),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id").notNull(),
  snapToken: text("snap_token"),
  operation: text("operation").notNull().default("WRITE"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type PermifyRelationship = typeof permifyRelationships.$inferSelect;

export const permifyPermissionChecks = pgTable("permify_permission_checks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull(),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id").notNull(),
  permission: text("permission").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id").notNull(),
  allowed: boolean("allowed").notNull(),
  reason: text("reason"),
  checkedAt: timestamp("checked_at").defaultNow(),
});
export type PermifyPermissionCheck = typeof permifyPermissionChecks.$inferSelect;

// ── Infrastructure: Keycloak User Provisioning Audit ─────────────────────────
export const keycloakProvisioningLog = pgTable("keycloak_provisioning_log", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  keycloakUserId: text("keycloak_user_id"),
  username: text("username").notNull(),
  email: text("email"),
  realm: text("realm").notNull().default("nexthub"),
  roles: text("roles").array().notNull().default([]),
  linkedEntityType: text("linked_entity_type"),
  linkedEntityId: text("linked_entity_id"),
  operation: text("operation").notNull().default("CREATE"),
  status: text("status").notNull().default("SUCCESS"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type KeycloakProvisioningLog = typeof keycloakProvisioningLog.$inferSelect;

// ── Infrastructure: Lakehouse Sync Queue ──────────────────────────────────────
export const lakehouseSyncQueue = pgTable("lakehouse_sync_queue", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  eventType: text("event_type").notNull(),
  sourceTable: text("source_table").notNull(),
  sourceId: text("source_id").notNull(),
  payload: text("payload").notNull(),
  retries: integer("retries").notNull().default(0),
  status: text("status").notNull().default("PENDING"),
  syncedAt: timestamp("synced_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type LakehouseSyncQueue = typeof lakehouseSyncQueue.$inferSelect;

// ── Infrastructure: Redis Cache Invalidation Log ──────────────────────────────
export const redisCacheInvalidations = pgTable("redis_cache_invalidations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  namespace: text("namespace").notNull(),
  cacheKey: text("cache_key").notNull(),
  reason: text("reason"),
  invalidatedBy: text("invalidated_by"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type RedisCacheInvalidation = typeof redisCacheInvalidations.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════════
// MOSIP IDENTITY — eKYC, eSignet OIDC4VP/OIDC4VCI, Verifiable Credentials
// ═══════════════════════════════════════════════════════════════════════════════

/** Audit log of every MOSIP OTP generation request */
export const mosipOtpLog = pgTable("mosip_otp_log", {
  id:              serial("id").primaryKey(),
  tenantId:        varchar("tenant_id", { length: 64 }).notNull(),
  individualId:    varchar("individual_id", { length: 64 }).notNull(),
  individualIdType:varchar("individual_id_type", { length: 16 }).notNull(),
  transactionId:   varchar("transaction_id", { length: 64 }).notNull().unique(),
  otpChannel:      text("otp_channel").array().notNull(),
  maskedEmail:     varchar("masked_email", { length: 64 }),
  maskedMobile:    varchar("masked_mobile", { length: 32 }),
  status:          varchar("status", { length: 32 }).notNull().default("OTP_SENT"),
  errorCode:       varchar("error_code", { length: 32 }),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  tenantIdx:       index("mosip_otp_tenant_idx").on(t.tenantId),
  txnIdx:          index("mosip_otp_txn_idx").on(t.transactionId),
}));

/** Stores the result of each MOSIP IDA eKYC verification */
export const mosipEkycSubmissions = pgTable("mosip_ekyc_submissions", {
  id:              serial("id").primaryKey(),
  tenantId:        varchar("tenant_id", { length: 64 }).notNull(),
  individualId:    varchar("individual_id", { length: 64 }).notNull(),
  individualIdType:varchar("individual_id_type", { length: 16 }).notNull(),
  transactionId:   varchar("transaction_id", { length: 64 }).notNull().unique(),
  consentObtained: boolean("consent_obtained").notNull().default(false),
  requestedAttributes: text("requested_attributes").array().notNull(),
  kycData:         jsonb("kyc_data"),
  status:          varchar("status", { length: 32 }).notNull().default("PENDING"),
  errorCode:       varchar("error_code", { length: 32 }),
  partnerId:       varchar("partner_id", { length: 64 }),
  responseTime:    timestamp("response_time"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  tenantIdx:       index("mosip_ekyc_tenant_idx").on(t.tenantId),
  individualIdx:   index("mosip_ekyc_individual_idx").on(t.individualId),
  txnIdx:          index("mosip_ekyc_txn_idx").on(t.transactionId),
}));

/** Tracks eSignet OIDC4VP authorization sessions */
export const esignetSessions = pgTable("esignet_sessions", {
  id:              serial("id").primaryKey(),
  tenantId:        varchar("tenant_id", { length: 64 }).notNull(),
  clientId:        varchar("client_id", { length: 128 }).notNull(),
  state:           varchar("state", { length: 128 }).notNull().unique(),
  nonce:           varchar("nonce", { length: 128 }).notNull(),
  redirectUri:     text("redirect_uri").notNull(),
  scope:           text("scope"),
  acrValues:       text("acr_values"),
  authorizationUrl:text("authorization_url"),
  authCode:        varchar("auth_code", { length: 256 }),
  accessToken:     text("access_token"),
  idToken:         text("id_token"),
  tokenExpiresAt:  timestamp("token_expires_at"),
  status:          varchar("status", { length: 32 }).notNull().default("INITIATED"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  tenantIdx:       index("esignet_tenant_idx").on(t.tenantId),
  stateIdx:        index("esignet_state_idx").on(t.state),
}));

/** Records every Verifiable Credential issued via eSignet OIDC4VCI */
export const verifiableCredentials = pgTable("verifiable_credentials", {
  id:              serial("id").primaryKey(),
  tenantId:        varchar("tenant_id", { length: 64 }).notNull(),
  individualId:    varchar("individual_id", { length: 64 }).notNull(),
  format:          varchar("format", { length: 32 }).notNull().default("ldp_vc"),
  credentialData:  jsonb("credential_data").notNull(),
  cNonce:          varchar("c_nonce", { length: 128 }),
  issuedAt:        timestamp("issued_at").notNull().defaultNow(),
  expiresAt:       timestamp("expires_at"),
  revokedAt:       timestamp("revoked_at"),
  status:          varchar("status", { length: 32 }).notNull().default("ACTIVE"),
  partnerId:       varchar("partner_id", { length: 64 }),
  sessionId:       integer("session_id"),
}, (t) => ({
  tenantIdx:       index("vc_tenant_idx").on(t.tenantId),
  individualIdx:   index("vc_individual_idx").on(t.individualId),
  statusIdx:       index("vc_status_idx").on(t.status),
}));

/** Links a G2P disbursement to a MOSIP identity verification outcome */
export const g2pIdentityVerifications = pgTable("g2p_identity_verifications", {
  id:              serial("id").primaryKey(),
  tenantId:        varchar("tenant_id", { length: 64 }).notNull(),
  beneficiaryId:   varchar("beneficiary_id", { length: 64 }).notNull(),
  disbursementId:  varchar("disbursement_id", { length: 64 }),
  individualId:    varchar("individual_id", { length: 64 }).notNull(),
  individualIdType:varchar("individual_id_type", { length: 16 }).notNull(),
  transactionId:   varchar("transaction_id", { length: 64 }).notNull().unique(),
  programId:       varchar("program_id", { length: 64 }),
  verified:        boolean("verified").notNull().default(false),
  kycData:         jsonb("kyc_data"),
  verifiedAt:      timestamp("verified_at"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  tenantIdx:       index("g2p_idv_tenant_idx").on(t.tenantId),
  beneficiaryIdx:  index("g2p_idv_beneficiary_idx").on(t.beneficiaryId),
  txnIdx:          index("g2p_idv_txn_idx").on(t.transactionId),
}));

// ─── MOSIP CITIZEN REGISTRATION PIPELINE ─────────────────────────────────────

/** Tracks citizen pre-registration applications (Stage 1 — AID issuance) */
export const mosipRegistrations = pgTable("mosip_registrations", {
  id:                serial("id").primaryKey(),
  tenantId:          varchar("tenant_id", { length: 64 }).notNull(),
  preRegistrationId: varchar("pre_registration_id", { length: 64 }).notNull().unique(),
  createdBy:         varchar("created_by", { length: 128 }).notNull(),
  langCode:          varchar("lang_code", { length: 8 }).notNull().default("eng"),
  statusCode:        varchar("status_code", { length: 32 }).notNull().default("PENDING_APPOINTMENT"),
  fullName:          varchar("full_name", { length: 256 }),
  dateOfBirth:       varchar("date_of_birth", { length: 16 }),
  gender:            varchar("gender", { length: 32 }),
  email:             varchar("email", { length: 256 }),
  phone:             varchar("phone", { length: 32 }),
  postalCode:        varchar("postal_code", { length: 16 }),
  appointmentDate:   varchar("appointment_date", { length: 16 }),
  centerId:          varchar("center_id", { length: 64 }),
  registrationId:    varchar("registration_id", { length: 64 }), // RID after packet upload
  createdAt:         timestamp("created_at").notNull().defaultNow(),
  updatedAt:         timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  tenantIdx:         index("mosip_reg_tenant_idx").on(t.tenantId),
  preRegIdx:         index("mosip_reg_prereg_idx").on(t.preRegistrationId),
  statusIdx:         index("mosip_reg_status_idx").on(t.statusCode),
}));

/** Tracks registration packet submissions to the Registration Processor (Stage 2) */
export const mosipRegistrationPackets = pgTable("mosip_registration_packets", {
  id:             serial("id").primaryKey(),
  tenantId:       varchar("tenant_id", { length: 64 }).notNull(),
  registrationId: varchar("registration_id", { length: 64 }).notNull().unique(), // RID
  packetId:       varchar("packet_id", { length: 128 }).notNull(),
  packetName:     varchar("packet_name", { length: 256 }).notNull(),
  source:         varchar("source", { length: 64 }).notNull().default("NEXTHUB"),
  process:        varchar("process", { length: 16 }).notNull().default("NEW"),
  schemaVersion:  varchar("schema_version", { length: 16 }),
  statusCode:     varchar("status_code", { length: 64 }).notNull().default("RECEIVED"),
  statusComment:  text("status_comment"),
  uploadedAt:     timestamp("uploaded_at").notNull().defaultNow(),
  processedAt:    timestamp("processed_at"),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
  updatedAt:      timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  tenantIdx:      index("mosip_pkt_tenant_idx").on(t.tenantId),
  ridIdx:         index("mosip_pkt_rid_idx").on(t.registrationId),
  statusIdx:      index("mosip_pkt_status_idx").on(t.statusCode),
}));

/** Stores issued UIN records and their lifecycle state (Stage 3 — UIN issuance) */
export const mosipUinRecords = pgTable("mosip_uin_records", {
  id:             serial("id").primaryKey(),
  tenantId:       varchar("tenant_id", { length: 64 }).notNull(),
  uinHash:        varchar("uin_hash", { length: 128 }).notNull().unique(), // SHA-256 of UIN
  registrationId: varchar("registration_id", { length: 64 }),
  status:         varchar("status", { length: 32 }).notNull().default("ACTIVATED"),
  fullName:       varchar("full_name", { length: 256 }),
  dateOfBirth:    varchar("date_of_birth", { length: 16 }),
  gender:         varchar("gender", { length: 32 }),
  lockedAuthTypes:jsonb("locked_auth_types"),  // array of locked auth types
  issuedAt:       timestamp("issued_at"),
  lastUpdatedAt:  timestamp("last_updated_at"),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
  updatedAt:      timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  tenantIdx:      index("mosip_uin_tenant_idx").on(t.tenantId),
  uinHashIdx:     index("mosip_uin_hash_idx").on(t.uinHash),
  statusIdx:      index("mosip_uin_status_idx").on(t.status),
}));

/** Stores Virtual IDs (VIDs) generated for UINs (Stage 4 — VID generation) */
export const mosipVidRecords = pgTable("mosip_vid_records", {
  id:          serial("id").primaryKey(),
  tenantId:    varchar("tenant_id", { length: 64 }).notNull(),
  vidHash:     varchar("vid_hash", { length: 128 }).notNull().unique(), // SHA-256 of VID
  uinHash:     varchar("uin_hash", { length: 128 }).notNull(),
  vidType:     varchar("vid_type", { length: 16 }).notNull().default("PERPETUAL"),
  status:      varchar("status", { length: 16 }).notNull().default("ACTIVE"),
  expiryTime:  timestamp("expiry_time"),
  generatedOn: timestamp("generated_on").notNull().defaultNow(),
  revokedAt:   timestamp("revoked_at"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  tenantIdx:   index("mosip_vid_tenant_idx").on(t.tenantId),
  uinHashIdx:  index("mosip_vid_uin_hash_idx").on(t.uinHash),
  statusIdx:   index("mosip_vid_status_idx").on(t.status),
}));

/** Tracks national ID credential issuance requests (Stage 5 — credential issuance) */
export const mosipCredentialRequests = pgTable("mosip_credential_requests", {
  id:              serial("id").primaryKey(),
  tenantId:        varchar("tenant_id", { length: 64 }).notNull(),
  requestId:       varchar("request_id", { length: 128 }).notNull().unique(),
  credentialType:  varchar("credential_type", { length: 32 }).notNull().default("pdf"),
  issuer:          varchar("issuer", { length: 128 }),
  recepientId:     varchar("recepient_id", { length: 64 }).notNull(),
  recepientIdType: varchar("recepient_id_type", { length: 8 }).notNull().default("UIN"),
  status:          varchar("status", { length: 32 }).notNull().default("REQUESTED"),
  statusComment:   text("status_comment"),
  dataShareUrl:    text("data_share_url"),
  requestedAt:     timestamp("requested_at").notNull().defaultNow(),
  issuedAt:        timestamp("issued_at"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  tenantIdx:       index("mosip_cred_tenant_idx").on(t.tenantId),
  requestIdx:      index("mosip_cred_request_idx").on(t.requestId),
  statusIdx:       index("mosip_cred_status_idx").on(t.status),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// FACE BIOMETRIC — Next-Generation Facial Recognition + Liveness Detection
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * face_verify_logs — Audit log for all 1:1 face verification requests.
 * Stores result metadata; raw embeddings are never persisted here.
 */
export const faceVerifyLogs = pgTable("face_verify_logs", {
  id:              serial("id").primaryKey(),
  subjectId:       varchar("subject_id",  { length: 128 }),
  tenantId:        varchar("tenant_id",   { length: 64 }),
  verified:        boolean("verified").notNull(),
  similarity:      real("similarity").notNull(),
  distance:        real("distance").notNull(),
  threshold:       real("threshold").notNull(),
  livenessPassed:  boolean("liveness_passed"),
  livenessScore:   real("liveness_score"),
  qualityPassed:   boolean("quality_passed"),
  qualityScore:    real("quality_score"),
  faceCountProbe:  integer("face_count_probe").notNull().default(0),
  faceCountRef:    integer("face_count_ref").notNull().default(0),
  imageHashProbe:  varchar("image_hash_probe", { length: 64 }),
  processingMs:    real("processing_ms"),
  cached:          boolean("cached").notNull().default(false),
  verifiedAt:      timestamp("verified_at").notNull().defaultNow(),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  subjectIdx:  index("fvl_subject_idx").on(t.subjectId),
  tenantIdx:   index("fvl_tenant_idx").on(t.tenantId),
  verifiedIdx: index("fvl_verified_idx").on(t.verified),
  createdIdx:  index("fvl_created_idx").on(t.createdAt),
}));

/**
 * face_liveness_logs — Audit log for passive liveness / anti-spoofing checks.
 */
export const faceLivenessLogs = pgTable("face_liveness_logs", {
  id:            serial("id").primaryKey(),
  subjectId:     varchar("subject_id",  { length: 128 }),
  tenantId:      varchar("tenant_id",   { length: 64 }),
  isLive:        boolean("is_live").notNull(),
  spoofScore:    real("spoof_score").notNull(),
  livenessScore: real("liveness_score").notNull(),
  attackType:    varchar("attack_type", { length: 64 }),
  faceDetected:  boolean("face_detected").notNull().default(false),
  imageHash:     varchar("image_hash",  { length: 64 }),
  processingMs:  real("processing_ms"),
  cached:        boolean("cached").notNull().default(false),
  checkedAt:     timestamp("checked_at").notNull().defaultNow(),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  subjectIdx:  index("fll_subject_idx").on(t.subjectId),
  tenantIdx:   index("fll_tenant_idx").on(t.tenantId),
  isLiveIdx:   index("fll_is_live_idx").on(t.isLive),
  createdIdx:  index("fll_created_idx").on(t.createdAt),
}));

/**
 * face_enrollments — Tracks enrolled face subjects.
 * Actual 512-d ArcFace embeddings are stored in Redis (face-biometric sidecar).
 */
export const faceEnrollments = pgTable("face_enrollments", {
  id:            serial("id").primaryKey(),
  subjectId:     varchar("subject_id",  { length: 128 }).notNull().unique(),
  tenantId:      varchar("tenant_id",   { length: 64 }),
  embeddingDim:  integer("embedding_dim").notNull().default(512),
  livenessPassed: boolean("liveness_passed"),
  qualityPassed:  boolean("quality_passed"),
  enrolledAt:    timestamp("enrolled_at").notNull().defaultNow(),
  updatedAt:     timestamp("updated_at").notNull().defaultNow(),
  revokedAt:     timestamp("revoked_at"),
  isActive:      boolean("is_active").notNull().default(true),
}, (t) => ({
  subjectIdx:  uniqueIndex("fe_subject_idx").on(t.subjectId),
  tenantIdx:   index("fe_tenant_idx").on(t.tenantId),
  activeIdx:   index("fe_active_idx").on(t.isActive),
}));

/**
 * face_identify_logs — Audit log for 1:N face identification requests.
 */
export const faceIdentifyLogs = pgTable("face_identify_logs", {
  id:             serial("id").primaryKey(),
  tenantId:       varchar("tenant_id",     { length: 64 }),
  identified:     boolean("identified").notNull(),
  topMatchId:     varchar("top_match_id",  { length: 128 }),
  topSimilarity:  real("top_similarity").notNull().default(0),
  candidateCount: integer("candidate_count").notNull().default(0),
  probeLiveness:  boolean("probe_liveness"),
  processingMs:   real("processing_ms"),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  tenantIdx:      index("fil_tenant_idx").on(t.tenantId),
  identifiedIdx:  index("fil_identified_idx").on(t.identified),
  createdIdx:     index("fil_created_idx").on(t.createdAt),
}));

// ── Face Biometric Partner API — Partner Registry ─────────────────────────────
export const facePartners = pgTable("face_partners", {
  id:            text("id").primaryKey(),
  name:          text("name").notNull(),
  orgType:       text("org_type").notNull().default("commercial"),
  contactEmail:  text("contact_email").notNull(),
  website:       text("website"),
  status:        text("status").notNull().default("active"),
  allowedScopes: text("allowed_scopes").notNull().default('["face:verify","face:liveness","face:quality"]'),
  createdAt:     timestamp("created_at").defaultNow(),
  updatedAt:     timestamp("updated_at").defaultNow(),
}, (t) => ({
  statusIdx: index("fp_status_idx").on(t.status),
}));

// ── Face Biometric Partner API — API Keys ─────────────────────────────────────
export const facePartnerApiKeys = pgTable("face_partner_api_keys", {
  id:           text("id").primaryKey(),
  partnerId:    text("partner_id").notNull(),
  name:         text("name").notNull(),
  keyPrefix:    text("key_prefix").notNull(),
  keyHash:      text("key_hash").notNull().unique(),
  scopes:       text("scopes").notNull().default('["face:verify","face:liveness"]'),
  rateLimitRpm: integer("rate_limit_rpm").notNull().default(60),
  environment:  text("environment").notNull().default("production"),
  isActive:     boolean("is_active").notNull().default(true),
  lastUsedAt:   timestamp("last_used_at"),
  expiresAt:    timestamp("expires_at"),
  createdAt:    timestamp("created_at").defaultNow(),
  updatedAt:    timestamp("updated_at").defaultNow(),
}, (t) => ({
  partnerIdx: index("fpak_partner_idx").on(t.partnerId),
  hashIdx:    uniqueIndex("fpak_hash_idx").on(t.keyHash),
  activeIdx:  index("fpak_active_idx").on(t.isActive),
}));

// ── Face Biometric Partner API — Usage Logs ───────────────────────────────────
export const facePartnerUsageLogs = pgTable("face_partner_usage_logs", {
  id:         text("id").primaryKey(),
  keyId:      text("key_id").notNull(),
  partnerId:  text("partner_id").notNull(),
  endpoint:   text("endpoint").notNull(),
  statusCode: integer("status_code").notNull(),
  latencyMs:  integer("latency_ms"),
  requestId:  text("request_id"),
  ipAddress:  text("ip_address"),
  createdAt:  timestamp("created_at").defaultNow(),
}, (t) => ({
  partnerIdx: index("fpul_partner_idx").on(t.partnerId),
  keyIdx:     index("fpul_key_idx").on(t.keyId),
  createdIdx: index("fpul_created_idx").on(t.createdAt),
}));

// ── Face Biometric — Batch Identification Logs ────────────────────────────────
export const faceBatchIdentifyLogs = pgTable("face_batch_identify_logs", {
  id:              text("id").primaryKey(),
  partnerId:       text("partner_id"),
  tenantId:        text("tenant_id"),
  totalProbes:     integer("total_probes").notNull(),
  identifiedCount: integer("identified_count").notNull(),
  processingMs:    real("processing_ms"),
  requestId:       text("request_id"),
  ipAddress:       text("ip_address"),
  createdAt:       timestamp("created_at").defaultNow(),
}, (t) => ({
  partnerIdx: index("fbil_partner_idx").on(t.partnerId),
  createdIdx: index("fbil_created_idx").on(t.createdAt),
}));

// ── Face Biometric — Signed Payment Assertions ────────────────────────────────
// Stores RS256-signed JWT assertions issued after a successful face verification
// for payment authentication (SCA/CBN compliance).
export const facePaymentAssertions = pgTable("face_payment_assertions", {
  id:            text("id").primaryKey(),
  subjectId:     text("subject_id").notNull(),
  tenantId:      text("tenant_id"),
  partnerId:     text("partner_id"),
  jwtToken:      text("jwt_token").notNull(),
  similarity:    real("similarity").notNull(),
  livenessPassed: boolean("liveness_passed"),
  qualityPassed: boolean("quality_passed"),
  issuedAt:      timestamp("issued_at").defaultNow(),
  expiresAt:     timestamp("expires_at").notNull(),
  usedAt:        timestamp("used_at"),
  revoked:       boolean("revoked").notNull().default(false),
  revokedReason: text("revoked_reason"),
  ipAddress:     text("ip_address"),
  requestId:     text("request_id"),
}, (t) => ({
  subjectIdx:  index("fpa_subject_idx").on(t.subjectId),
  partnerIdx:  index("fpa_partner_idx").on(t.partnerId),
  expiresIdx:  index("fpa_expires_idx").on(t.expiresAt),
  revokedIdx:  index("fpa_revoked_idx").on(t.revoked),
}));

// ── Face Biometric — Public Key Cache ─────────────────────────────────────────
// Caches the RS256 public key fetched from the face-biometric sidecar for
// assertion verification without round-tripping the sidecar on every request.
export const faceBiometricPublicKeys = pgTable("face_biometric_public_keys", {
  id:         text("id").primaryKey(),
  algorithm:  text("algorithm").notNull().default("RS256"),
  publicKey:  text("public_key").notNull(),
  fingerprint: text("fingerprint").notNull(),
  isActive:   boolean("is_active").notNull().default(true),
  fetchedAt:  timestamp("fetched_at").defaultNow(),
  expiresAt:  timestamp("expires_at"),
}, (t) => ({
  activeIdx:      index("fbpk_active_idx").on(t.isActive),
  fingerprintIdx: uniqueIndex("fbpk_fingerprint_idx").on(t.fingerprint),
}));

// ─── SOTA Face Biometric: Active Liveness Sessions ───────────────────────────
export const faceActiveLivenessSessions = pgTable("face_active_liveness_sessions", (t) => ({
  id:            serial("id").primaryKey(),
  sessionId:     varchar("session_id", { length: 64 }).notNull().unique(),
  challengeType: text("challenge_type").notNull(),
  nonce:         varchar("nonce", { length: 128 }).notNull(),
  tenantId:      varchar("tenant_id", { length: 64 }),
  passed:        boolean("passed"),
  confidence:    real("confidence"),
  framesAnalyzed: integer("frames_analyzed"),
  failureReason: text("failure_reason"),
  expiresAt:     timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt:     timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  verifiedAt:    timestamp("verified_at", { withTimezone: true }),
}), (t) => ({
  sessionIdx:  uniqueIndex("fals_session_idx").on(t.sessionId),
  tenantIdx:   index("fals_tenant_idx").on(t.tenantId),
  createdIdx:  index("fals_created_idx").on(t.createdAt),
}));

// ─── SOTA Face Biometric: Deepfake Detection Logs ────────────────────────────
export const faceDeepfakeLogs = pgTable("face_deepfake_logs", (t) => ({
  id:               serial("id").primaryKey(),
  requestId:        varchar("request_id", { length: 64 }).notNull().unique(),
  tenantId:         varchar("tenant_id", { length: 64 }),
  partnerId:        varchar("partner_id", { length: 64 }),
  isDeepfake:       boolean("is_deepfake").notNull(),
  deepfakeScore:    real("deepfake_score").notNull(),
  attackType:       text("attack_type"),
  dctArtifactScore: real("dct_artifact_score"),
  consistencyScore: real("consistency_score"),
  confidence:       real("confidence").notNull(),
  context:          text("context"),
  createdAt:        timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}), (t) => ({
  requestIdx:  uniqueIndex("fddl_request_idx").on(t.requestId),
  tenantIdx:   index("fddl_tenant_idx").on(t.tenantId),
  deepfakeIdx: index("fddl_deepfake_idx").on(t.isDeepfake),
  createdIdx:  index("fddl_created_idx").on(t.createdAt),
}));

// ─── SOTA Face Biometric: Attribute Analysis Logs ────────────────────────────
export const faceAttributeLogs = pgTable("face_attribute_logs", (t) => ({
  id:                serial("id").primaryKey(),
  requestId:         varchar("request_id", { length: 64 }).notNull().unique(),
  tenantId:          varchar("tenant_id", { length: 64 }),
  partnerId:         varchar("partner_id", { length: 64 }),
  ageEstimate:       real("age_estimate"),
  ageBracket:        text("age_bracket"),
  gender:            text("gender"),
  genderConfidence:  real("gender_confidence"),
  emotion:           text("emotion"),
  poseYaw:           real("pose_yaw"),
  posePitch:         real("pose_pitch"),
  poseRoll:          real("pose_roll"),
  occlusionRegions:  jsonb("occlusion_regions"),
  createdAt:         timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}), (t) => ({
  requestIdx: uniqueIndex("fal_request_idx").on(t.requestId),
  tenantIdx:  index("fal_tenant_idx").on(t.tenantId),
  createdIdx: index("fal_created_idx").on(t.createdAt),
}));

// ─── SOTA Face Biometric: Video Verification Logs ────────────────────────────
export const faceVideoVerifyLogs = pgTable("face_video_verify_logs", (t) => ({
  id:                  serial("id").primaryKey(),
  requestId:           varchar("request_id", { length: 64 }).notNull().unique(),
  subjectId:           varchar("subject_id", { length: 64 }),
  tenantId:            varchar("tenant_id", { length: 64 }),
  partnerId:           varchar("partner_id", { length: 64 }),
  verified:            boolean("verified").notNull(),
  meanSimilarity:      real("mean_similarity").notNull(),
  minSimilarity:       real("min_similarity"),
  maxSimilarity:       real("max_similarity"),
  framesAnalyzed:      integer("frames_analyzed").notNull(),
  framesPassed:        integer("frames_passed").notNull(),
  temporalConsistency: real("temporal_consistency"),
  livenessPassed:      boolean("liveness_passed"),
  processingMs:        real("processing_ms"),
  context:             text("context"),
  createdAt:           timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}), (t) => ({
  requestIdx: uniqueIndex("fvvl_request_idx").on(t.requestId),
  subjectIdx: index("fvvl_subject_idx").on(t.subjectId),
  tenantIdx:  index("fvvl_tenant_idx").on(t.tenantId),
  createdIdx: index("fvvl_created_idx").on(t.createdAt),
}));

// ─── SOTA Face Biometric: Bias Audit Snapshots ───────────────────────────────
export const faceBiasAuditSnapshots = pgTable("face_bias_audit_snapshots", (t) => ({
  id:              serial("id").primaryKey(),
  snapshotId:      varchar("snapshot_id", { length: 64 }).notNull().unique(),
  generatedAt:     timestamp("generated_at", { withTimezone: true }).notNull(),
  windowSecs:      integer("window_secs").notNull(),
  totalOperations: bigint("total_operations", { mode: "number" }).notNull(),
  groups:          jsonb("groups").notNull(),
  alerts:          jsonb("alerts").notNull(),
  summary:         jsonb("summary").notNull(),
  createdAt:       timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}), (t) => ({
  snapshotIdx:  uniqueIndex("fbas_snapshot_idx").on(t.snapshotId),
  generatedIdx: index("fbas_generated_idx").on(t.generatedAt),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// NINAuth / NIMC Integration Schema
// ═══════════════════════════════════════════════════════════════════════════════

// Stores the OIDC consent sessions initiated via NINAuth
export const ninAuthConsentSessions = pgTable("ninauth_consent_sessions", {
  id:            text("id").primaryKey(),
  state:         text("state").notNull().unique(),
  codeVerifier:  text("code_verifier").notNull(),
  nonce:         text("nonce"),
  scopes:        text("scopes").array().notNull().default([]),
  redirectUri:   text("redirect_uri"),
  userId:        text("user_id"),
  status:        text("status").notNull().default("pending"), // pending | completed | expired
  createdAt:     timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt:   timestamp("completed_at", { withTimezone: true }),
  expiresAt:     timestamp("expires_at", { withTimezone: true }),
}, (t) => ({
  stateIdx:  uniqueIndex("ninauth_session_state_idx").on(t.state),
  userIdx:   index("ninauth_session_user_idx").on(t.userId),
}));

// Stores verified NIN identity claims received from NINAuth tokens
export const ninAuthVerifiedIdentities = pgTable("ninauth_verified_identities", {
  id:            text("id").primaryKey(),
  ninHash:       text("nin_hash").notNull(),          // SHA-256 of NIN — never store raw NIN
  firstName:     text("first_name"),
  lastName:      text("last_name"),
  middleName:    text("middle_name"),
  dateOfBirth:   text("date_of_birth"),
  gender:        text("gender"),
  phoneHash:     text("phone_hash"),
  emailHash:     text("email_hash"),
  stateOfOrigin: text("state_of_origin"),
  lga:           text("lga"),
  verifiedAt:    timestamp("verified_at", { withTimezone: true }).defaultNow().notNull(),
  accessToken:   text("access_token"),               // encrypted at rest
  idToken:       text("id_token"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  userId:        text("user_id"),
  sessionId:     text("session_id"),
}, (t) => ({
  ninHashIdx:  index("ninauth_identity_nin_hash_idx").on(t.ninHash),
  userIdx:     index("ninauth_identity_user_idx").on(t.userId),
}));

// Stores direct NIN verification results (operator KYC flow)
export const ninVerificationLogs = pgTable("nin_verification_logs", {
  id:           text("id").primaryKey(),
  ninPrefix:    text("nin_prefix").notNull(),         // first 4 digits + "*******"
  verified:     boolean("verified").notNull(),
  matchType:    text("match_type"),                   // "exact" | "phonetic" | "partial"
  fieldResults: jsonb("field_results"),               // per-field match results
  operatorId:   text("operator_id"),
  partnerId:    text("partner_id"),
  requestedAt:  timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  partnerIdx: index("nin_verify_partner_idx").on(t.partnerId, t.requestedAt),
}));

// Stores NIN face-match results (ArcFace + liveness)
export const ninFaceMatchLogs = pgTable("nin_face_match_logs", {
  id:              text("id").primaryKey(),
  ninPrefix:       text("nin_prefix").notNull(),
  verified:        boolean("verified").notNull(),
  similarity:      real("similarity").notNull(),
  livenessPassed:  boolean("liveness_passed").notNull(),
  livenessScore:   real("liveness_score").notNull(),
  matchType:       text("match_type").notNull(),
  context:         text("context").notNull(),         // "government" | "payment" | "border" | "event"
  assertionJwtId:  text("assertion_jwt_id"),
  partnerId:       text("partner_id"),
  userId:          text("user_id"),
  requestedAt:     timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  partnerIdx: index("nin_face_match_partner_idx").on(t.partnerId, t.requestedAt),
  contextIdx: index("nin_face_match_context_idx").on(t.context),
}));

// Stores W3C Verifiable Credential verification results
export const ninVCVerificationLogs = pgTable("nin_vc_verification_logs", {
  id:              text("id").primaryKey(),
  vcId:            text("vc_id").notNull(),
  issuer:          text("issuer"),
  subjectNinHash:  text("subject_nin_hash"),
  valid:           boolean("valid").notNull(),
  claims:          jsonb("claims"),
  partnerId:       text("partner_id"),
  error:           text("error"),
  verifiedAt:      timestamp("verified_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  vcIdIdx:    index("nin_vc_id_idx").on(t.vcId),
  subjectIdx: index("nin_vc_subject_idx").on(t.subjectNinHash),
}));
