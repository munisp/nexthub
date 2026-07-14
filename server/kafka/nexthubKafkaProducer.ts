/**
 * nexthubKafkaProducer.ts — NextHub Kafka Event Producer
 * ─────────────────────────────────────────────────────────────────────────────
 * Publishes domain events from NextHub to the shared Kafka broker.
 *
 * Topics produced by NextHub (consumed by Paygate and other DFSPs):
 *
 *   nexthub.transfer.received.v1     — A new transfer was received from a DFSP
 *   nexthub.transfer.committed.v1    — A transfer was committed (fulfilment received)
 *   nexthub.transfer.aborted.v1      — A transfer was aborted
 *   nexthub.fx.rates.v1              — New FX rates published (Paygate caches these)
 *   nexthub.ndc.breach.v1            — A DFSP has breached its NDC limit
 *   nexthub.settlement.closed.v1     — A settlement window has closed
 *   nexthub.settlement.settled.v1    — A settlement window has been settled
 *   nexthub.participant.status.v1    — A DFSP's status changed (suspended, etc.)
 *
 * Topics consumed by NextHub (produced by Paygate):
 *   paygate.audit.v1                 — Paygate transaction audit events → Regulator Portal
 *   paygate.corridor.volume.v1       — Aggregated corridor volume → Analytics
 */

import { ENV } from "../_core/env";

// ─── Topic Registry ───────────────────────────────────────────────────────────
export const NEXTHUB_KAFKA_TOPICS = {
  // NextHub → Paygate (and other DFSPs)
  TRANSFER_RECEIVED:     "nexthub.transfer.received.v1",
  TRANSFER_COMMITTED:    "nexthub.transfer.committed.v1",
  TRANSFER_ABORTED:      "nexthub.transfer.aborted.v1",
  FX_RATES:              "nexthub.fx.rates.v1",
  FX_RATE_PUBLISHED:     "nexthub.fx.rate.published.v1",  // single rate publish event
  NDC_BREACH:            "nexthub.ndc.breach.v1",
  SETTLEMENT_OPENED:     "nexthub.settlement.opened.v1",  // window opened
  SETTLEMENT_CLOSED:     "nexthub.settlement.closed.v1",
  SETTLEMENT_SETTLE:     "nexthub.settlement.settle.v1",  // trigger Rust settlement service
  SETTLEMENT_SETTLED:    "nexthub.settlement.settled.v1",
  PARTICIPANT_STATUS:    "nexthub.participant.status.v1",
  PARTICIPANT_ONBOARDED: "nexthub.participant.onboarded.v1",
  DISPUTE_RAISED:        "nexthub.dispute.raised.v1",
  DISPUTE_DECISION:      "nexthub.dispute.decision.v1",
  RTGS_SUBMITTED:        "nexthub.rtgs.submitted.v1",
  IDENTITY_LOOKUP:       "nexthub.identity.lookup.v1",
  HSM_KEY_EVENT:         "nexthub.hsm.key.event.v1",
  DISPUTE_ESCALATED:     "nexthub.dispute.escalated.v1",
  AML_FLAG:              "nexthub.aml.flag.v1",

  // Participant lifecycle
  PARTICIPANT_SUSPENDED:    "nexthub.participant.suspended.v1",
  PARTICIPANT_OFFBOARDED:   "nexthub.participant.offboarded.v1",
  // PISP / Consent
  PISP_CONSENT_GRANTED:     "nexthub.pisp.consent.granted.v1",
  PISP_CONSENT_REVOKED:     "nexthub.pisp.consent.revoked.v1",
  PISP_PAYMENT_EXECUTED:    "nexthub.pisp.payment.executed.v1",
  // Dispute
  DISPUTE_REVIEWED:         "nexthub.dispute.reviewed.v1",
  DISPUTE_UPHELD:           "nexthub.dispute.upheld.v1",
  DISPUTE_REJECTED:         "nexthub.dispute.rejected.v1",
  // FX
  FX_CONVERSION:            "nexthub.fx.conversion.v1",
  // Billing
  INVOICE_ISSUED:           "nexthub.billing.invoice.issued.v1",
  INVOICE_PAID:             "nexthub.billing.invoice.paid.v1",
  FEE_TIER_UPDATED:         "nexthub.billing.fee_tier.updated.v1",
  // DFSP
  DFSP_REGISTERED:          "nexthub.dfsp.registered.v1",
  DFSP_UPDATED:             "nexthub.dfsp.updated.v1",
  // Oracle
  ORACLE_REGISTERED:        "nexthub.oracle.registered.v1",
  ORACLE_DEACTIVATED:       "nexthub.oracle.deactivated.v1",
  // Reconciliation
  RECON_EXCEPTION_RAISED:   "nexthub.recon.exception.raised.v1",
  RECON_EXCEPTION_RESOLVED: "nexthub.recon.exception.resolved.v1",
  // Security
  SECURITY_EVENT:           "nexthub.security.event.v1",
  AML_RULE_CHANGED:         "nexthub.aml.rule.changed.v1",
  // CBDC
  CBDC_ACCOUNT_CREATED:     "nexthub.cbdc.account.created.v1",
  CBDC_TRANSFER:            "nexthub.cbdc.transfer.v1",
  // G2P
  G2P_BATCH_CREATED:        "nexthub.g2p.batch.created.v1",
  G2P_BATCH_APPROVED:       "nexthub.g2p.batch.approved.v1",
  // Remittance
  REMITTANCE_INITIATED:     "nexthub.remittance.initiated.v1",
  CORRIDOR_REGISTERED:      "nexthub.remittance.corridor.registered.v1",
  // Healthcare
  HEALTHCARE_CLAIM:         "nexthub.healthcare.claim.v1",
  // Bulk transfers
  BULK_TRANSFER_CREATED:    "nexthub.bulk.transfer.created.v1",
  // NDC
  NDC_LIMIT_UPDATED:        "nexthub.ndc.limit.updated.v1",
  // Paygate → NextHub (consumed here)
  PAYGATE_AUDIT:         "paygate.audit.v1",
  PAYGATE_CORRIDOR_VOL:  "paygate.corridor.volume.v1",
  // Face Biometric
  FACE_VERIFY_RESULT:          "nexthub.face.verify.result.v1",
  FACE_LIVENESS_RESULT:        "nexthub.face.liveness.result.v1",
  FACE_ENROLL_RESULT:          "nexthub.face.enroll.result.v1",
  FACE_IDENTIFY_RESULT:        "nexthub.face.identify.result.v1",
  FACE_FAILED:                 "nexthub.face.failed.v1",
  FACE_BATCH_IDENTIFY_RESULT:  "nexthub.face.batch.identify.result.v1",
  FACE_PAYMENT_ASSERTION:      "nexthub.face.payment.assertion.v1",
  FACE_FIDELITY_AUDIT:         "nexthub.face.fidelity.audit.v1",
  FACE_ENROLL_GATED:           "nexthub.face.enroll.gated.v1",
  // Partner API
  PARTNER_API_CALL:            "nexthub.partner.api.call.v1",
  PARTNER_KEY_ISSUED:          "nexthub.partner.key.issued.v1",
  PARTNER_KEY_REVOKED:         "nexthub.partner.key.revoked.v1",
  // MOSIP Registration
  MOSIP_REGISTRATION:          "nexthub.mosip.registration.v1",
  MOSIP_EKYC_RESULT:           "nexthub.mosip.ekyc.result.v1",
  MOSIP_OTP_SENT:              "nexthub.mosip.otp.sent.v1",
  MOSIP_VC_ISSUED:             "nexthub.mosip.vc.issued.v1",
  // NINAuth / NIMC integration topics
  NINAUTH_CONSENT:             "nexthub.ninauth.consent.v1",
  NINAUTH_KYC:                 "nexthub.ninauth.kyc.verified.v1",
  NINAUTH_FACE_MATCH:          "nexthub.ninauth.face.match.v1",
  NINAUTH_VC_VERIFIED:         "nexthub.ninauth.vc.verified.v1",
} as const;

// ─── Typed event payloads ─────────────────────────────────────────────────────
export interface TransferReceivedEvent {
  transferId: string;
  payerFspId: string;
  payeeFspId: string;
  amountKobo: number;
  currency: string;
  ilpPacket?: string;
  condition?: string;
  timestamp: string;
}

export interface TransferCommittedEvent {
  transferId: string;
  payerFspId: string;
  payeeFspId: string;
  amountKobo: number;
  currency: string;
  schemeFeeKobo: number | null;
  timestamp: string;
}

export interface TransferAbortedEvent {
  transferId: string;
  errorCode: string | null;
  errorDescription: string | null;
  timestamp: string;
}

export interface FxRatesEvent {
  sourceCurrency: string;
  targetCurrency: string;
  midRate: number;
  buyRate: number;
  sellRate: number;
  markupBps: number;
  validFrom: string;
  validTo: string;
  provider: string;
}

export interface NdcBreachEvent {
  dfspId: string;
  limitType: string;
  threshold: number;
  breachAmount: number;
  currency: string;
  timestamp: string;
}

export interface SettlementWindowOpenedEvent {
  windowId: string;
  windowType: string;
  currency: string;
  openedAt: string;
}

export interface SettlementClosedEvent {
  windowId: string;
  currency: string;
  totalTransfers: number;
  totalAmountKobo: number;
  closedAt: string;
}

export interface SettlementSettleEvent {
  windowId: string;
  currency: string;
  totalAmountKobo: number;
  netPositions: Array<{
    dfspId: string;
    dfspName: string;
    netPositionKobo: number;
    currency: string;
  }>;
  initiatedAt: string;
}

export interface AmlFlagEvent {
  transferId: string;
  payerFspId: string;
  payeeFspId: string;
  amountKobo: number;
  currency: string;
  matchedRules: string[];
  fraudScore: number;
  timestamp: string;
}

export interface SettlementSettledEvent {
  windowId: string;
  currency: string;
  totalTransfers: number;
  totalAmountKobo: number;
  settledAt: string;
  railReference: string | null;
}

export interface ParticipantStatusEvent {
  dfspId: string;
  dfspName: string;
  previousStatus: string;
  newStatus: string;
  reason: string;
  timestamp: string;
}

// ─── Additional typed event interfaces ──────────────────────────────────────
export interface ParticipantLifecycleEvent {
  participantId: string;
  dfspId: string;
  status: string;
  reason?: string;
  timestamp: string;
}
export interface PispConsentEvent {
  consentId: string;
  pispId: string;
  dfspId: string;
  state: string;
  timestamp: string;
}
export interface PispPaymentExecutedEvent {
  consentId: string;
  transferId: string;
  amountKobo: number;
  currency: string;
  timestamp: string;
}
export interface DisputeLifecycleEvent {
  disputeId: string;
  transferId: string;
  status: string;
  resolution?: string;
  initiatedByDfspId: string;
  amountKobo: number;
  currency: string;
  timestamp: string;
}
export interface FxConversionEvent {
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmount: string;
  targetAmount: string;
  rate: string;
  timestamp: string;
}
export interface InvoiceKafkaEvent {
  invoiceId: string;
  dfspId: string;
  totalAmountKobo: number;
  currency: string;
  status: string;
  timestamp: string;
}
export interface FeeTierKafkaEvent {
  dfspId: string;
  feeType: string;
  feeAmountKobo: number;
  currency: string;
  timestamp: string;
}
export interface DfspKafkaEvent {
  dfspId: string;
  name: string;
  status?: string;
  timestamp: string;
}
export interface HsmKeyKafkaEvent {
  keyLabel: string;
  keyType: string;
  eventType: "GENERATED" | "ROTATED" | "RETIRED";
  performedBy: string;
  timestamp: string;
}
export interface OracleKafkaEvent {
  oracleId: string;
  oracleType: string;
  endpoint: string;
  isActive: boolean;
  timestamp: string;
}
export interface ReconExceptionKafkaEvent {
  exceptionId: string;
  transferId: string;
  breakType: string;
  status: string;
  dfspId: string;
  timestamp: string;
}
export interface SecurityKafkaEvent {
  eventId: string;
  eventType: string;
  severity: string;
  dfspId?: string;
  description: string;
  timestamp: string;
}
export interface AmlRuleKafkaEvent {
  ruleId: string;
  ruleName: string;
  isEnabled: boolean;
  timestamp: string;
}
export interface CbdcAccountKafkaEvent {
  accountId: string;
  ownerId: string;
  currency: string;
  ledger: number;
  timestamp: string;
}
export interface CbdcTransferKafkaEvent {
  transferId: string;
  fromAccountId: string;
  toAccountId: string;
  amountKobo: number;
  currency: string;
  timestamp: string;
}
export interface G2pBatchKafkaEvent {
  batchId: string;
  programId: string;
  totalAmountKobo: number;
  recipientCount: number;
  status: string;
  timestamp: string;
}
export interface RemittanceKafkaEvent {
  transferId: string;
  senderCountry: string;
  receiverCountry: string;
  amountKobo: number;
  currency: string;
  timestamp: string;
}
export interface CorridorKafkaEvent {
  corridorId: string;
  sourceCountry: string;
  destinationCountry: string;
  isActive: boolean;
  timestamp: string;
}
export interface HealthcareClaimKafkaEvent {
  claimId: string;
  providerId: string;
  payerId: string;
  amountKobo: number;
  currency: string;
  status: string;
  timestamp: string;
}
export interface BulkTransferKafkaEvent {
  bulkTransferId: string;
  payerFsp: string;
  totalTransfers: number;
  totalAmountKobo: number;
  currency: string;
  state: string;
  timestamp: string;
}
export interface NdcLimitKafkaEvent {
  dfspId: string;
  dfspName: string;
  limitType: string;
  limitAmountKobo: number;
  currency: string;
  timestamp: string;
}

// ─── Lazy Kafka producer ──────────────────────────────────────────────────────
let _kafka: any = null;
let _producer: any = null;
let _producerConnected = false;

async function getKafka() {
  const brokers = (ENV as any).kafkaBootstrapServers;
  if (!brokers) return null;
  if (_kafka) return _kafka;
  try {
    const { Kafka } = await import("kafkajs" as any);
    _kafka = new Kafka({
      clientId: "nexthub-core",
      brokers: brokers.split(",").map((b: string) => b.trim()),
      ssl: brokers.includes("ssl://"),
      retry: { initialRetryTime: 300, retries: 8 },
    });
    return _kafka;
  } catch {
    console.warn("[kafka] kafkajs not available — event publishing disabled");
    return null;
  }
}

async function getProducer() {
  if (_producer && _producerConnected) return _producer;
  const kafka = await getKafka();
  if (!kafka) return null;
  try {
    _producer = kafka.producer({
      maxInFlightRequests: 5,
      idempotent: true,
      // Batching: collect messages for up to 20ms before sending
      // This dramatically reduces broker round-trips under high load
      // (e.g. 1000 transfers/s → ~20 batches/s instead of 1000 sends/s)
      linger: 20,
      // Allow up to 1MB per batch (default 16KB is too small for financial events)
      batch: { size: 1_048_576 },
      // Compression: snappy reduces message size by ~60% for JSON payloads
      compression: 2, // CompressionTypes.Snappy
    });
    await _producer.connect();
    _producerConnected = true;
    console.log("[nexthub-kafka] Producer connected");
    return _producer;
  } catch (err) {
    console.warn("[nexthub-kafka] Producer connection failed:", err);
    return null;
  }
}

// ─── Core publish function ────────────────────────────────────────────────────
export async function publishKafkaEvent<T extends object>(
  topic: string,
  payload: T,
  key?: string,
): Promise<boolean> {
  const producer = await getProducer();
  if (!producer) return false;
  try {
    await producer.send({
      topic,
      messages: [{
        key: key ?? null,
        value: JSON.stringify({
          ...payload,
          _meta: {
            topic,
            publishedAt: new Date().toISOString(),
            source: "nexthub-core",
          },
        }),
        headers: {
          "content-type": "application/json",
          "source": "nexthub-core",
        },
      }],
    });
    return true;
  } catch (err) {
    console.error(`[nexthub-kafka] Failed to publish to ${topic}:`, err);
    return false;
  }
}

// ─── Typed publish helpers ────────────────────────────────────────────────────
export const nexthubPublish = {
  transferReceived: (e: TransferReceivedEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.TRANSFER_RECEIVED, e, e.transferId),

  transferCommitted: (e: TransferCommittedEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.TRANSFER_COMMITTED, e, e.transferId),

  transferAborted: (e: TransferAbortedEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.TRANSFER_ABORTED, e, e.transferId),

  fxRates: (e: FxRatesEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.FX_RATES, e, `${e.sourceCurrency}/${e.targetCurrency}`),

  ndcBreach: (e: NdcBreachEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.NDC_BREACH, e, e.dfspId),

  settlementWindowOpened: (e: SettlementWindowOpenedEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.SETTLEMENT_OPENED, e, e.windowId),
  settlementClosed: (e: SettlementClosedEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.SETTLEMENT_CLOSED, e, e.windowId),
  settlementSettle: (e: SettlementSettleEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.SETTLEMENT_SETTLE, e, e.windowId),
  settlementSettled: (e: SettlementSettledEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.SETTLEMENT_SETTLED, e, e.windowId),
  participantStatus: (e: ParticipantStatusEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.PARTICIPANT_STATUS, e, e.dfspId),
  amlFlag: (e: AmlFlagEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.AML_FLAG, e, e.transferId),

  // ── Participant lifecycle ──────────────────────────────────────────────────────────
  participantSuspended: (e: ParticipantLifecycleEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.PARTICIPANT_SUSPENDED, e, e.participantId),
  participantOffboarded: (e: ParticipantLifecycleEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.PARTICIPANT_OFFBOARDED, e, e.participantId),

  // ── PISP ───────────────────────────────────────────────────────────────────────────────
  pispConsentGranted: (e: PispConsentEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.PISP_CONSENT_GRANTED, e, e.consentId),
  pispConsentRevoked: (e: PispConsentEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.PISP_CONSENT_REVOKED, e, e.consentId),
  pispPaymentExecuted: (e: PispPaymentExecutedEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.PISP_PAYMENT_EXECUTED, e, e.consentId),

  // ── Dispute ────────────────────────────────────────────────────────────────────────
  disputeReviewed: (e: DisputeLifecycleEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.DISPUTE_REVIEWED, e, e.disputeId),
  disputeUpheld: (e: DisputeLifecycleEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.DISPUTE_UPHELD, e, e.disputeId),
  disputeRejected: (e: DisputeLifecycleEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.DISPUTE_REJECTED, e, e.disputeId),

  // ── FX ──────────────────────────────────────────────────────────────────────────────
  fxRatePublished: (e: FxConversionEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.FX_CONVERSION, e, `${e.sourceCurrency}/${e.targetCurrency}`),

  // ── Billing ──────────────────────────────────────────────────────────────────────
  invoiceIssued: (e: InvoiceKafkaEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.INVOICE_ISSUED, e, e.invoiceId),
  invoicePaid: (e: InvoiceKafkaEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.INVOICE_PAID, e, e.invoiceId),
  feeTierUpdated: (e: FeeTierKafkaEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.FEE_TIER_UPDATED, e, e.dfspId),

  // ── DFSP ───────────────────────────────────────────────────────────────────────────
  dfspRegistered: (e: DfspKafkaEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.DFSP_REGISTERED, e, e.dfspId),
  dfspUpdated: (e: DfspKafkaEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.DFSP_UPDATED, e, e.dfspId),

  // ── Oracle ────────────────────────────────────────────────────────────────────────
  oracleRegistered: (e: OracleKafkaEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.ORACLE_REGISTERED, e, e.oracleId),
  oracleDeactivated: (e: OracleKafkaEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.ORACLE_DEACTIVATED, e, e.oracleId),

  // ── Reconciliation ───────────────────────────────────────────────────────────────
  reconExceptionRaised: (e: ReconExceptionKafkaEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.RECON_EXCEPTION_RAISED, e, e.exceptionId),
  reconExceptionResolved: (e: ReconExceptionKafkaEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.RECON_EXCEPTION_RESOLVED, e, e.exceptionId),

  // ── Security ─────────────────────────────────────────────────────────────────────
  securityEvent: (e: SecurityKafkaEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.SECURITY_EVENT, e, e.eventId),
  amlRuleChanged: (e: AmlRuleKafkaEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.AML_RULE_CHANGED, e, e.ruleId),

  // ── CBDC ───────────────────────────────────────────────────────────────────────────
  cbdcAccountCreated: (e: CbdcAccountKafkaEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.CBDC_ACCOUNT_CREATED, e, e.accountId),
  cbdcTransfer: (e: CbdcTransferKafkaEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.CBDC_TRANSFER, e, e.transferId),

  // ── G2P ─────────────────────────────────────────────────────────────────────────────
  g2pBatchCreated: (e: G2pBatchKafkaEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.G2P_BATCH_CREATED, e, e.batchId),
  g2pBatchApproved: (e: G2pBatchKafkaEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.G2P_BATCH_APPROVED, e, e.batchId),

  // ── Remittance ───────────────────────────────────────────────────────────────────
  remittanceInitiated: (e: RemittanceKafkaEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.REMITTANCE_INITIATED, e, e.transferId),
  corridorRegistered: (e: CorridorKafkaEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.CORRIDOR_REGISTERED, e, e.corridorId),

  // ── Healthcare ──────────────────────────────────────────────────────────────────
  healthcareClaim: (e: HealthcareClaimKafkaEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.HEALTHCARE_CLAIM, e, e.claimId),

  // ── Bulk transfers ───────────────────────────────────────────────────────────────
  bulkTransferCreated: (e: BulkTransferKafkaEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.BULK_TRANSFER_CREATED, e, e.bulkTransferId),

  // ── NDC ────────────────────────────────────────────────────────────────────────────
  ndcLimitUpdated: (e: NdcLimitKafkaEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.NDC_LIMIT_UPDATED, e, e.dfspId),
};

// ─── Graceful shutdown ────────────────────────────────────────────────────────

// ─── Batch publish function ───────────────────────────────────────────────────
// Sends multiple events to the same topic in a single broker round-trip.
// Use this for bulk operations (e.g. settlement net position events, bulk transfers).
export async function publishKafkaEventBatch<T extends object>(
  topic: string,
  payloads: T[],
  keyFn?: (payload: T) => string,
): Promise<boolean> {
  if (payloads.length === 0) return true;
  const producer = await getProducer();
  if (!producer) return false;
  try {
    const now = new Date().toISOString();
    await producer.send({
      topic,
      messages: payloads.map((payload) => ({
        key: keyFn ? keyFn(payload) : null,
        value: JSON.stringify({
          ...payload,
          _meta: { topic, publishedAt: now, source: "nexthub-core" },
        }),
        headers: { "content-type": "application/json" },
      })),
    });
    return true;
  } catch (err) {
    console.error(`[nexthub-kafka] Batch publish failed for topic ${topic}:`, err);
    return false;
  }
}
export async function disconnectKafkaProducer() {
  if (_producer && _producerConnected) {
    await _producer.disconnect();
    _producerConnected = false;
    console.log("[nexthub-kafka] Producer disconnected");
  }
}
