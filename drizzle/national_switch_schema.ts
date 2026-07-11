/**
 * national_switch_schema.ts
 *
 * Drizzle ORM schema for all four national-switch gap-roadmap phases.
 * Every entity that flows through the Go/Rust/Python microservices is
 * persisted here so the hub has a complete, auditable record.
 *
 * Phase 1 — CB Liquidity Adapter (Go)
 *   rtgsSubmissions       — each ISO 20022 pacs.009 message sent to CBN RTGS
 *   rtgsMessages          — raw XML payload archive (for audit/replay)
 *   cbLiquidityPositions  — intraday liquidity positions per DFSP per window
 *
 * Phase 2 — National Identity Directory (Rust + Python)
 *   dictAliases           — registered payment aliases (phone, email, NIN, BVN)
 *   identityLookups       — every alias resolution request (audit trail)
 *   biometricVerifications — BVN/NIN biometric check results
 *
 * Phase 3 — Physical HSM (Go PKCS#11)
 *   hsmKeys               — key inventory (label, type, status, expiry)
 *   hsmOperations         — every sign/verify/MAC operation (audit log)
 *   keyRotationLog        — scheduled and ad-hoc key rotation events
 *
 * Phase 4 — Dispute Arbitration Tribunal (Go Temporal + Python ML)
 *   disputeWorkflows      — Temporal workflow state mirror
 *   disputeEvidence       — evidence submissions from both DFSPs
 *   disputeDecisions      — arbitrator decisions with reasoning
 *   disputeChargebacks    — chargeback instructions issued to settlement
 *   disputeMlScores       — ML fraud-score results per dispute
 */

import {
  pgTable,
  pgEnum,
  varchar,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ═══════════════════════════════════════════════════════════════════════════════
// ENUMS
// ═══════════════════════════════════════════════════════════════════════════════

export const rtgsSubmissionStatusEnum = pgEnum("rtgs_submission_status", [
  "PENDING",
  "SUBMITTED",
  "ACKNOWLEDGED",
  "SETTLED",
  "REJECTED",
  "FAILED",
  "TIMED_OUT",
]);

export const aliasTypeEnum = pgEnum("alias_type", [
  "PHONE",
  "EMAIL",
  "BVN",
  "NIN",
  "ACCOUNT_NUMBER",
  "NUBAN",
  "VIRTUAL_ACCOUNT",
]);

export const biometricStatusEnum = pgEnum("biometric_status", [
  "PENDING",
  "VERIFIED",
  "FAILED",
  "EXPIRED",
  "REVOKED",
]);

export const hsmKeyTypeEnum = pgEnum("hsm_key_type", [
  "RSA_2048",
  "RSA_4096",
  "EC_P256",
  "EC_P384",
  "AES_256",
  "HMAC_SHA256",
]);

export const hsmKeyStatusEnum = pgEnum("hsm_key_status", [
  "ACTIVE",
  "INACTIVE",
  "COMPROMISED",
  "EXPIRED",
  "DESTROYED",
  "PENDING_ROTATION",
]);

export const hsmOperationTypeEnum = pgEnum("hsm_operation_type", [
  "SIGN",
  "VERIFY",
  "COMPUTE_MAC",
  "VERIFY_MAC",
  "ENCRYPT",
  "DECRYPT",
  "GENERATE_KEY_PAIR",
  "IMPORT_KEY",
  "EXPORT_PUBLIC_KEY",
  "DESTROY_KEY",
]);

export const disputeWorkflowStatusEnum = pgEnum("dispute_workflow_status", [
  "RAISED",
  "EVIDENCE_COLLECTION",
  "ML_SCORING",
  "UNDER_REVIEW",
  "DECISION_ISSUED",
  "CHARGEBACK_INITIATED",
  "APPEALED",
  "CLOSED",
  "TIMED_OUT",
]);

export const disputeDecisionEnum = pgEnum("dispute_decision", [
  "UPHELD",
  "REJECTED",
  "SPLIT",
  "WITHDRAWN",
  "TIMED_OUT",
]);

export const chargebackStatusEnum = pgEnum("chargeback_status", [
  "PENDING",
  "SUBMITTED",
  "PROCESSED",
  "FAILED",
]);

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 1 — CB LIQUIDITY ADAPTER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * rtgsSubmissions — one row per ISO 20022 pacs.009 message sent to CBN RTGS.
 * The Go service inserts a row before submitting and updates it on ACK/NACK.
 */
export const rtgsSubmissions = pgTable(
  "rtgs_submissions",
  {
    id:                varchar("id", { length: 36 }).primaryKey(), // UUID
    tenantId:          varchar("tenant_id", { length: 36 }).notNull(),
    settlementWindowId:varchar("settlement_window_id", { length: 36 }),
    messageId:         varchar("message_id", { length: 64 }).notNull().unique(), // MsgId in pacs.009
    endToEndId:        varchar("end_to_end_id", { length: 64 }).notNull(),
    rtgsReference:     varchar("rtgs_reference", { length: 128 }),   // CBN-assigned ref
    debtorInstitution: varchar("debtor_institution", { length: 50 }).notNull(),
    creditorInstitution:varchar("creditor_institution", { length: 50 }).notNull(),
    amountKobo:        bigint("amount_kobo", { mode: "number" }).notNull(),
    currency:          varchar("currency", { length: 3 }).notNull().default("NGN"),
    status:            rtgsSubmissionStatusEnum("status").notNull().default("PENDING"),
    submittedAt:       timestamp("submitted_at"),
    acknowledgedAt:    timestamp("acknowledged_at"),
    settledAt:         timestamp("settled_at"),
    rejectedAt:        timestamp("rejected_at"),
    rejectionReason:   text("rejection_reason"),
    retryCount:        integer("retry_count").notNull().default(0),
    maxRetries:        integer("max_retries").notNull().default(3),
    nextRetryAt:       timestamp("next_retry_at"),
    idempotencyKey:    varchar("idempotency_key", { length: 128 }).notNull().unique(),
    kafkaOffset:       bigint("kafka_offset", { mode: "number" }),
    kafkaPartition:    integer("kafka_partition"),
    createdAt:         timestamp("created_at").notNull().defaultNow(),
    updatedAt:         timestamp("updated_at").notNull().defaultNow(),
    metadata:          jsonb("metadata"),
  },
  (t) => ({
    statusIdx:          index("rtgs_submissions_status_idx").on(t.status),
    windowIdx:          index("rtgs_submissions_window_idx").on(t.settlementWindowId),
    tenantStatusIdx:    index("rtgs_submissions_tenant_status_idx").on(t.tenantId, t.status),
    submittedAtIdx:     index("rtgs_submissions_submitted_at_idx").on(t.submittedAt),
    retryIdx:           index("rtgs_submissions_retry_idx").on(t.status, t.nextRetryAt),
  })
);

/**
 * rtgsMessages — raw XML payload archive for each RTGS submission.
 * Stored separately to keep rtgsSubmissions lean.
 */
export const rtgsMessages = pgTable(
  "rtgs_messages",
  {
    id:             varchar("id", { length: 36 }).primaryKey(),
    submissionId:   varchar("submission_id", { length: 36 }).notNull(), // FK → rtgsSubmissions.id
    direction:      varchar("direction", { length: 8 }).notNull(), // "OUTBOUND" | "INBOUND"
    messageType:    varchar("message_type", { length: 32 }).notNull(), // "pacs.009" | "pacs.002" | "MT202"
    rawXml:         text("raw_xml").notNull(),
    checksum:       varchar("checksum", { length: 64 }).notNull(), // SHA-256 of rawXml
    signedBy:       varchar("signed_by", { length: 64 }), // HSM key label used to sign
    signatureHex:   text("signature_hex"),
    createdAt:      timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    submissionIdx:  index("rtgs_messages_submission_idx").on(t.submissionId),
    directionIdx:   index("rtgs_messages_direction_idx").on(t.direction, t.createdAt),
  })
);

/**
 * cbLiquidityPositions — intraday liquidity position per DFSP per settlement window.
 * Updated by the Go service after each RTGS settlement.
 */
export const cbLiquidityPositions = pgTable(
  "cb_liquidity_positions",
  {
    id:                varchar("id", { length: 36 }).primaryKey(),
    tenantId:          varchar("tenant_id", { length: 36 }).notNull(),
    dfspId:            varchar("dfsp_id", { length: 36 }).notNull(),
    settlementWindowId:varchar("settlement_window_id", { length: 36 }),
    currency:          varchar("currency", { length: 3 }).notNull().default("NGN"),
    openingBalanceKobo:bigint("opening_balance_kobo", { mode: "number" }).notNull().default(0),
    settledKobo:       bigint("settled_kobo", { mode: "number" }).notNull().default(0),
    pendingKobo:       bigint("pending_kobo", { mode: "number" }).notNull().default(0),
    closingBalanceKobo:bigint("closing_balance_kobo", { mode: "number" }),
    rtgsSubmissionCount:integer("rtgs_submission_count").notNull().default(0),
    lastRtgsRef:       varchar("last_rtgs_ref", { length: 128 }),
    positionDate:      timestamp("position_date").notNull(),
    createdAt:         timestamp("created_at").notNull().defaultNow(),
    updatedAt:         timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    dfspWindowIdx:     uniqueIndex("cb_liquidity_dfsp_window_idx").on(t.dfspId, t.settlementWindowId, t.currency),
    tenantDateIdx:     index("cb_liquidity_tenant_date_idx").on(t.tenantId, t.positionDate),
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2 — NATIONAL IDENTITY DIRECTORY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * dictAliases — the national payment alias directory (like PIX DICT or UPI VPA).
 * One row per registered alias. The Rust service owns writes; TypeScript reads.
 */
export const dictAliases = pgTable(
  "dict_aliases",
  {
    id:              varchar("id", { length: 36 }).primaryKey(),
    tenantId:        varchar("tenant_id", { length: 36 }).notNull(),
    aliasType:       aliasTypeEnum("alias_type").notNull(),
    aliasValue:      varchar("alias_value", { length: 256 }).notNull(),
    aliasHash:       varchar("alias_hash", { length: 64 }).notNull(), // SHA-256 for lookup
    ownerName:       varchar("owner_name", { length: 256 }).notNull(),
    ownerBvn:        varchar("owner_bvn", { length: 11 }),
    ownerNin:        varchar("owner_nin", { length: 11 }),
    dfspId:          varchar("dfsp_id", { length: 36 }).notNull(),
    accountNumber:   varchar("account_number", { length: 20 }),
    bankCode:        varchar("bank_code", { length: 10 }),
    isActive:        boolean("is_active").notNull().default(true),
    isVerified:      boolean("is_verified").notNull().default(false),
    verifiedAt:      timestamp("verified_at"),
    expiresAt:       timestamp("expires_at"),
    registeredAt:    timestamp("registered_at").notNull().defaultNow(),
    deregisteredAt:  timestamp("deregistered_at"),
    deregistrationReason: text("deregistration_reason"),
    createdAt:       timestamp("created_at").notNull().defaultNow(),
    updatedAt:       timestamp("updated_at").notNull().defaultNow(),
    metadata:        jsonb("metadata"),
  },
  (t) => ({
    aliasHashIdx:    uniqueIndex("dict_aliases_hash_idx").on(t.aliasHash),
    aliasValueIdx:   index("dict_aliases_value_idx").on(t.aliasType, t.aliasValue),
    dfspIdx:         index("dict_aliases_dfsp_idx").on(t.dfspId),
    activeIdx:       index("dict_aliases_active_idx").on(t.isActive, t.aliasType),
    tenantIdx:       index("dict_aliases_tenant_idx").on(t.tenantId),
  })
);

/**
 * identityLookups — every alias resolution request for audit and analytics.
 */
export const identityLookups = pgTable(
  "identity_lookups",
  {
    id:              varchar("id", { length: 36 }).primaryKey(),
    tenantId:        varchar("tenant_id", { length: 36 }).notNull(),
    requestingDfsp:  varchar("requesting_dfsp", { length: 36 }).notNull(),
    aliasType:       aliasTypeEnum("alias_type").notNull(),
    aliasHash:       varchar("alias_hash", { length: 64 }).notNull(), // hashed for privacy
    resolvedAliasId: varchar("resolved_alias_id", { length: 36 }), // FK → dictAliases.id
    found:           boolean("found").notNull(),
    cacheHit:        boolean("cache_hit").notNull().default(false),
    responseTimeMs:  integer("response_time_ms"),
    correlationId:   varchar("correlation_id", { length: 64 }),
    transferId:      varchar("transfer_id", { length: 36 }), // if lookup was for a transfer
    ipAddress:       varchar("ip_address", { length: 45 }),
    createdAt:       timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantDfspIdx:   index("identity_lookups_tenant_dfsp_idx").on(t.tenantId, t.requestingDfsp),
    aliasHashIdx:    index("identity_lookups_alias_hash_idx").on(t.aliasHash),
    createdAtIdx:    index("identity_lookups_created_at_idx").on(t.createdAt),
    correlationIdx:  index("identity_lookups_correlation_idx").on(t.correlationId),
  })
);

/**
 * biometricVerifications — BVN/NIN biometric check results from the Python service.
 */
export const biometricVerifications = pgTable(
  "biometric_verifications",
  {
    id:              varchar("id", { length: 36 }).primaryKey(),
    tenantId:        varchar("tenant_id", { length: 36 }).notNull(),
    requestingDfsp:  varchar("requesting_dfsp", { length: 36 }).notNull(),
    verificationType:varchar("verification_type", { length: 10 }).notNull(), // "BVN" | "NIN"
    identifierHash:  varchar("identifier_hash", { length: 64 }).notNull(), // hashed BVN/NIN
    status:          biometricStatusEnum("status").notNull(),
    matchScore:      integer("match_score"), // 0–100 confidence score
    nibssRequestId:  varchar("nibss_request_id", { length: 128 }),
    nibssResponseCode:varchar("nibss_response_code", { length: 10 }),
    nibssResponseMsg:text("nibss_response_msg"),
    verifiedAt:      timestamp("verified_at"),
    expiresAt:       timestamp("expires_at"),
    correlationId:   varchar("correlation_id", { length: 64 }),
    transferId:      varchar("transfer_id", { length: 36 }),
    onboardingSessionId:varchar("onboarding_session_id", { length: 36 }),
    responseTimeMs:  integer("response_time_ms"),
    createdAt:       timestamp("created_at").notNull().defaultNow(),
    updatedAt:       timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantDfspIdx:   index("biometric_verifications_tenant_dfsp_idx").on(t.tenantId, t.requestingDfsp),
    statusIdx:       index("biometric_verifications_status_idx").on(t.status),
    correlationIdx:  index("biometric_verifications_correlation_idx").on(t.correlationId),
    createdAtIdx:    index("biometric_verifications_created_at_idx").on(t.createdAt),
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3 — PHYSICAL HSM
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * hsmKeys — inventory of all keys stored in the HSM.
 * The Go PKCS#11 adapter inserts a row on key generation and updates on rotation/destruction.
 */
export const hsmKeys = pgTable(
  "hsm_keys",
  {
    id:              varchar("id", { length: 36 }).primaryKey(),
    tenantId:        varchar("tenant_id", { length: 36 }).notNull(),
    keyLabel:        varchar("key_label", { length: 128 }).notNull(),
    keyType:         hsmKeyTypeEnum("key_type").notNull(),
    keyStatus:       hsmKeyStatusEnum("key_status").notNull().default("ACTIVE"),
    slotId:          integer("slot_id").notNull().default(0),
    purpose:         varchar("purpose", { length: 64 }).notNull(), // "NIP_SIGNING" | "SETTLEMENT_SIGNING" | "PISP_SIGNING" | "TLS" | "GENERAL"
    algorithm:       varchar("algorithm", { length: 32 }).notNull(), // "RSA-SHA256" | "ECDSA-SHA256" | "AES-256-GCM"
    keySizeBytes:    integer("key_size_bytes"),
    publicKeyPem:    text("public_key_pem"),   // exported public key (never private)
    fingerprint:     varchar("fingerprint", { length: 128 }), // SHA-256 of public key
    generatedAt:     timestamp("generated_at").notNull().defaultNow(),
    activatedAt:     timestamp("activated_at"),
    expiresAt:       timestamp("expires_at"),
    rotatedAt:       timestamp("rotated_at"),
    rotatedByKeyId:  varchar("rotated_by_key_id", { length: 36 }), // successor key
    destroyedAt:     timestamp("destroyed_at"),
    destroyedBy:     varchar("destroyed_by", { length: 64 }),
    generatedBy:     varchar("generated_by", { length: 64 }).notNull(), // user/service that generated
    hsmSerialNumber: varchar("hsm_serial_number", { length: 64 }),
    hsmFirmwareVersion:varchar("hsm_firmware_version", { length: 32 }),
    createdAt:       timestamp("created_at").notNull().defaultNow(),
    updatedAt:       timestamp("updated_at").notNull().defaultNow(),
    metadata:        jsonb("metadata"),
  },
  (t) => ({
    labelIdx:        uniqueIndex("hsm_keys_label_idx").on(t.keyLabel, t.tenantId),
    statusIdx:       index("hsm_keys_status_idx").on(t.keyStatus),
    purposeIdx:      index("hsm_keys_purpose_idx").on(t.purpose, t.keyStatus),
    expiryIdx:       index("hsm_keys_expiry_idx").on(t.expiresAt, t.keyStatus),
    tenantIdx:       index("hsm_keys_tenant_idx").on(t.tenantId),
  })
);

/**
 * hsmOperations — audit log of every cryptographic operation performed via the HSM.
 */
export const hsmOperations = pgTable(
  "hsm_operations",
  {
    id:              varchar("id", { length: 36 }).primaryKey(),
    tenantId:        varchar("tenant_id", { length: 36 }).notNull(),
    keyId:           varchar("key_id", { length: 36 }).notNull(), // FK → hsmKeys.id
    keyLabel:        varchar("key_label", { length: 128 }).notNull(),
    operationType:   hsmOperationTypeEnum("operation_type").notNull(),
    callerService:   varchar("caller_service", { length: 64 }).notNull(), // "nip-gateway" | "settlement" | "pisp"
    correlationId:   varchar("correlation_id", { length: 64 }),
    transferId:      varchar("transfer_id", { length: 36 }),
    inputSizeBytes:  integer("input_size_bytes"),
    outputSizeBytes: integer("output_size_bytes"),
    durationMs:      integer("duration_ms"),
    success:         boolean("success").notNull(),
    errorCode:       varchar("error_code", { length: 32 }),
    errorMessage:    text("error_message"),
    hsmSlotId:       integer("hsm_slot_id"),
    performedAt:     timestamp("performed_at").notNull().defaultNow(),
  },
  (t) => ({
    keyIdx:          index("hsm_operations_key_idx").on(t.keyId),
    tenantIdx:       index("hsm_operations_tenant_idx").on(t.tenantId, t.performedAt),
    correlationIdx:  index("hsm_operations_correlation_idx").on(t.correlationId),
    callerIdx:       index("hsm_operations_caller_idx").on(t.callerService, t.performedAt),
    successIdx:      index("hsm_operations_success_idx").on(t.success, t.performedAt),
  })
);

/**
 * keyRotationLog — records every key rotation event (scheduled and ad-hoc).
 */
export const keyRotationLog = pgTable(
  "key_rotation_log",
  {
    id:              varchar("id", { length: 36 }).primaryKey(),
    tenantId:        varchar("tenant_id", { length: 36 }).notNull(),
    oldKeyId:        varchar("old_key_id", { length: 36 }).notNull(),
    newKeyId:        varchar("new_key_id", { length: 36 }).notNull(),
    rotationReason:  varchar("rotation_reason", { length: 64 }).notNull(), // "SCHEDULED" | "COMPROMISE" | "EXPIRY" | "MANUAL"
    initiatedBy:     varchar("initiated_by", { length: 64 }).notNull(),
    approvedBy:      varchar("approved_by", { length: 64 }),
    rotationStartedAt:timestamp("rotation_started_at").notNull(),
    rotationCompletedAt:timestamp("rotation_completed_at"),
    affectedServices:jsonb("affected_services"), // list of services that were updated
    rollbackAvailable:boolean("rollback_available").notNull().default(true),
    rolledBackAt:    timestamp("rolled_back_at"),
    notes:           text("notes"),
    createdAt:       timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx:       index("key_rotation_log_tenant_idx").on(t.tenantId, t.rotationStartedAt),
    oldKeyIdx:       index("key_rotation_log_old_key_idx").on(t.oldKeyId),
    newKeyIdx:       index("key_rotation_log_new_key_idx").on(t.newKeyId),
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 4 — DISPUTE ARBITRATION TRIBUNAL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * disputeWorkflows — mirrors the Temporal workflow state in the hub's DB.
 * Updated by Temporal activities so the tRPC router can query without calling Temporal.
 */
export const disputeWorkflows = pgTable(
  "dispute_workflows",
  {
    id:                varchar("id", { length: 36 }).primaryKey(),
    tenantId:          varchar("tenant_id", { length: 36 }).notNull(),
    temporalWorkflowId:varchar("temporal_workflow_id", { length: 128 }).notNull().unique(),
    temporalRunId:     varchar("temporal_run_id", { length: 128 }),
    transferId:        varchar("transfer_id", { length: 36 }).notNull(),
    originalDisputeId: varchar("original_dispute_id", { length: 36 }), // FK → transferDisputes.id
    payerDfsp:         varchar("payer_dfsp", { length: 36 }).notNull(),
    payeeDfsp:         varchar("payee_dfsp", { length: 36 }).notNull(),
    amountKobo:        bigint("amount_kobo", { mode: "number" }).notNull(),
    currency:          varchar("currency", { length: 3 }).notNull().default("NGN"),
    reason:            text("reason").notNull(),
    raisedBy:          varchar("raised_by", { length: 64 }).notNull(),
    status:            disputeWorkflowStatusEnum("status").notNull().default("RAISED"),
    evidenceDeadline:  timestamp("evidence_deadline").notNull(),
    slaDeadline:       timestamp("sla_deadline").notNull(),
    appealDeadline:    timestamp("appeal_deadline"),
    raisedAt:          timestamp("raised_at").notNull().defaultNow(),
    closedAt:          timestamp("closed_at"),
    closureReason:     text("closure_reason"),
    mlScoreId:         varchar("ml_score_id", { length: 36 }), // FK → disputeMlScores.id
    decisionId:        varchar("decision_id", { length: 36 }), // FK → disputeDecisions.id
    chargebackId:      varchar("chargeback_id", { length: 36 }), // FK → disputeChargebacks.id
    createdAt:         timestamp("created_at").notNull().defaultNow(),
    updatedAt:         timestamp("updated_at").notNull().defaultNow(),
    metadata:          jsonb("metadata"),
  },
  (t) => ({
    statusIdx:         index("dispute_workflows_status_idx").on(t.status),
    tenantStatusIdx:   index("dispute_workflows_tenant_status_idx").on(t.tenantId, t.status),
    transferIdx:       index("dispute_workflows_transfer_idx").on(t.transferId),
    payerDfspIdx:      index("dispute_workflows_payer_dfsp_idx").on(t.payerDfsp),
    payeeDfspIdx:      index("dispute_workflows_payee_dfsp_idx").on(t.payeeDfsp),
    slaDeadlineIdx:    index("dispute_workflows_sla_deadline_idx").on(t.slaDeadline, t.status),
    evidenceDeadlineIdx:index("dispute_workflows_evidence_deadline_idx").on(t.evidenceDeadline, t.status),
  })
);

/**
 * disputeEvidence — evidence submissions from both DFSPs during the collection phase.
 */
export const disputeEvidence = pgTable(
  "dispute_evidence",
  {
    id:              varchar("id", { length: 36 }).primaryKey(),
    tenantId:        varchar("tenant_id", { length: 36 }).notNull(),
    workflowId:      varchar("workflow_id", { length: 36 }).notNull(), // FK → disputeWorkflows.id
    submittedByDfsp: varchar("submitted_by_dfsp", { length: 36 }).notNull(),
    submittedBy:     varchar("submitted_by", { length: 64 }).notNull(),
    evidenceType:    varchar("evidence_type", { length: 32 }).notNull(), // "TRANSACTION_LOG" | "SCREENSHOT" | "STATEMENT" | "AFFIDAVIT" | "OTHER"
    description:     text("description").notNull(),
    fileUrl:         text("file_url"),   // S3 URL of uploaded evidence file
    fileHash:        varchar("file_hash", { length: 64 }), // SHA-256 of file
    fileSizeBytes:   integer("file_size_bytes"),
    mimeType:        varchar("mime_type", { length: 128 }),
    isAccepted:      boolean("is_accepted"), // null = pending review
    reviewNotes:     text("review_notes"),
    reviewedBy:      varchar("reviewed_by", { length: 64 }),
    reviewedAt:      timestamp("reviewed_at"),
    submittedAt:     timestamp("submitted_at").notNull().defaultNow(),
    createdAt:       timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    workflowIdx:     index("dispute_evidence_workflow_idx").on(t.workflowId),
    dfspIdx:         index("dispute_evidence_dfsp_idx").on(t.submittedByDfsp, t.workflowId),
    tenantIdx:       index("dispute_evidence_tenant_idx").on(t.tenantId, t.submittedAt),
  })
);

/**
 * disputeDecisions — binding arbitrator decisions.
 */
export const disputeDecisions = pgTable(
  "dispute_decisions",
  {
    id:              varchar("id", { length: 36 }).primaryKey(),
    tenantId:        varchar("tenant_id", { length: 36 }).notNull(),
    workflowId:      varchar("workflow_id", { length: 36 }).notNull().unique(), // FK → disputeWorkflows.id
    decision:        disputeDecisionEnum("decision").notNull(),
    decidedBy:       varchar("decided_by", { length: 64 }).notNull(),
    reasoning:       text("reasoning").notNull(),
    mlRecommendation:varchar("ml_recommendation", { length: 32 }), // ML model's recommendation
    mlConfidence:    integer("ml_confidence"), // 0–100
    payerLiabilityPct:integer("payer_liability_pct").notNull().default(0), // 0–100
    payeeLiabilityPct:integer("payee_liability_pct").notNull().default(0), // 0–100
    chargebackAmountKobo:bigint("chargeback_amount_kobo", { mode: "number" }),
    isAppealed:      boolean("is_appealed").notNull().default(false),
    appealedAt:      timestamp("appealed_at"),
    appealOutcome:   varchar("appeal_outcome", { length: 32 }),
    decidedAt:       timestamp("decided_at").notNull().defaultNow(),
    createdAt:       timestamp("created_at").notNull().defaultNow(),
    updatedAt:       timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx:       index("dispute_decisions_tenant_idx").on(t.tenantId, t.decidedAt),
    decisionIdx:     index("dispute_decisions_decision_idx").on(t.decision),
  })
);

/**
 * disputeChargebacks — chargeback instructions issued to the settlement engine.
 */
export const disputeChargebacks = pgTable(
  "dispute_chargebacks",
  {
    id:              varchar("id", { length: 36 }).primaryKey(),
    tenantId:        varchar("tenant_id", { length: 36 }).notNull(),
    workflowId:      varchar("workflow_id", { length: 36 }).notNull(), // FK → disputeWorkflows.id
    decisionId:      varchar("decision_id", { length: 36 }).notNull(), // FK → disputeDecisions.id
    fromDfsp:        varchar("from_dfsp", { length: 36 }).notNull(), // DFSP that must pay back
    toDfsp:          varchar("to_dfsp", { length: 36 }).notNull(),
    amountKobo:      bigint("amount_kobo", { mode: "number" }).notNull(),
    currency:        varchar("currency", { length: 3 }).notNull().default("NGN"),
    status:          chargebackStatusEnum("status").notNull().default("PENDING"),
    settlementWindowId:varchar("settlement_window_id", { length: 36 }), // window it was processed in
    rtgsSubmissionId:varchar("rtgs_submission_id", { length: 36 }), // FK → rtgsSubmissions.id
    processedAt:     timestamp("processed_at"),
    failureReason:   text("failure_reason"),
    createdAt:       timestamp("created_at").notNull().defaultNow(),
    updatedAt:       timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    workflowIdx:     index("dispute_chargebacks_workflow_idx").on(t.workflowId),
    statusIdx:       index("dispute_chargebacks_status_idx").on(t.status),
    tenantIdx:       index("dispute_chargebacks_tenant_idx").on(t.tenantId, t.createdAt),
    fromDfspIdx:     index("dispute_chargebacks_from_dfsp_idx").on(t.fromDfsp, t.status),
  })
);

/**
 * disputeMlScores — ML fraud-score results produced by the Python scorer service.
 */
export const disputeMlScores = pgTable(
  "dispute_ml_scores",
  {
    id:              varchar("id", { length: 36 }).primaryKey(),
    tenantId:        varchar("tenant_id", { length: 36 }).notNull(),
    workflowId:      varchar("workflow_id", { length: 36 }).notNull(), // FK → disputeWorkflows.id
    modelVersion:    varchar("model_version", { length: 32 }).notNull(),
    fraudScore:      integer("fraud_score").notNull(), // 0–100
    recommendation:  varchar("recommendation", { length: 32 }).notNull(), // "UPHELD" | "REJECTED" | "REVIEW"
    confidence:      integer("confidence").notNull(), // 0–100
    featureVector:   jsonb("feature_vector"), // input features used for scoring
    shapValues:      jsonb("shap_values"), // SHAP explainability values
    scoredAt:        timestamp("scored_at").notNull().defaultNow(),
    scoringDurationMs:integer("scoring_duration_ms"),
    createdAt:       timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    workflowIdx:     index("dispute_ml_scores_workflow_idx").on(t.workflowId),
    tenantIdx:       index("dispute_ml_scores_tenant_idx").on(t.tenantId, t.scoredAt),
    fraudScoreIdx:   index("dispute_ml_scores_fraud_score_idx").on(t.fraudScore),
  })
);
