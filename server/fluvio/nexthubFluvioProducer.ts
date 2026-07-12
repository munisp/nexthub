/**
 * nexthubFluvioProducer.ts — NextHub Fluvio Real-Time Stream Producer
 * ─────────────────────────────────────────────────────────────────────────────
 * Fluvio is used for sub-second real-time streaming to SSE consumers.
 * Unlike Kafka (durable, batch-oriented), Fluvio is optimised for
 * low-latency fan-out to browser clients via Server-Sent Events.
 *
 * Topics produced by NextHub via Fluvio:
 *   ndc-breach-alerts      — Real-time NDC breach events → Paygate SSE clients
 *   fx-rate-ticks          — Live FX rate ticks → Paygate CorridorLiveStats
 *   settlement-updates     — Settlement window state changes → Paygate dashboard
 *   transfer-state-changes — Transfer state transitions → Paygate transfer tracker
 *
 * Paygate subscribes to these topics via its Fluvio consumer and fans them
 * out to browser clients through its own SSE endpoints.
 */

import { ENV } from "../_core/env";

// ─── Topic constants ──────────────────────────────────────────────────────────
export const NEXTHUB_FLUVIO_TOPICS = {
  NDC_BREACH_ALERTS:      "ndc-breach-alerts",
  FX_RATE_TICKS:          "fx-rate-ticks",
  SETTLEMENT_UPDATES:     "settlement-updates",
  TRANSFER_STATE_CHANGES: "transfer-state-changes",
  DISPUTE_UPDATES:        "dispute-updates",
  PISP_EVENTS:            "pisp-events",
  PARTICIPANT_EVENTS:     "participant-events",
  CBDC_EVENTS:            "cbdc-events",
  SECURITY_ALERTS:        "security-alerts",
} as const;

// ─── Typed payloads ───────────────────────────────────────────────────────────
export interface FluvioNdcBreachAlert {
  dfspId: string;
  dfspName: string;
  severity: "medium" | "high" | "critical";
  limitType: string;
  threshold: number;
  breachAmount: number;
  utilisationPct: number;
  currency: string;
  timestamp: string;
}

export interface FluvioFxRateTick {
  sourceCurrency: string;
  targetCurrency: string;
  midRate: number;
  change1h: number;   // % change over last 1h
  change24h: number;  // % change over last 24h
  timestamp: string;
}

export interface FluvioSettlementUpdate {
  windowId: string;
  status: string;
  currency: string;
  totalTransfers: number;
  totalAmountKobo: number;
  timestamp: string;
}

export interface FluvioTransferStateChange {
  transferId: string;
  payerFspId: string;
  payeeFspId: string;
  previousState: string;
  newState: string;
  amountKobo: number;
  currency: string;
  timestamp: string;
}

// ─── Lazy Fluvio client ───────────────────────────────────────────────────────
let _fluvio: any = null;
const _producers = new Map<string, any>();

async function getFluvio() {
  const endpoint = (ENV as any).fluvioEndpoint;
  if (!endpoint) return null;
  if (_fluvio) return _fluvio;
  try {
    const { Fluvio } = await import("@fluvio/client" as any);
    _fluvio = await Fluvio.connect(endpoint);
    console.log("[nexthub-fluvio] Connected to Fluvio at", endpoint);
    return _fluvio;
  } catch {
    console.warn("[nexthub-fluvio] @fluvio/client not available or endpoint unreachable — real-time streaming disabled");
    return null;
  }
}

async function getProducer(topic: string) {
  if (_producers.has(topic)) return _producers.get(topic);
  const fluvio = await getFluvio();
  if (!fluvio) return null;
  try {
    const producer = await fluvio.topicProducer(topic);
    _producers.set(topic, producer);
    return producer;
  } catch (err) {
    console.warn(`[nexthub-fluvio] Failed to get producer for topic ${topic}:`, err);
    return null;
  }
}

// ─── Core publish function ────────────────────────────────────────────────────
export async function publishFluvioEvent<T extends object>(
  topic: string,
  payload: T,
  key?: string,
): Promise<boolean> {
  const producer = await getProducer(topic);
  if (!producer) return false;
  try {
    const value = JSON.stringify({
      ...payload,
      _meta: { topic, publishedAt: new Date().toISOString(), source: "nexthub-core" },
    });
    if (key) {
      await producer.sendKeyValue(key, value);
    } else {
      await producer.send(value);
    }
    return true;
  } catch (err) {
    console.error(`[nexthub-fluvio] Failed to publish to ${topic}:`, err);
    return false;
  }
}

// ─── Typed publish helpers ────────────────────────────────────────────────────
export interface FluvioDisputeUpdate {
  disputeId: string;
  transferId: string;
  status: string;
  disputeType: string;
  initiatedByDfspId: string;
  amountKobo: number;
  currency: string;
  timestamp: string;
}

export interface FluvioPispEvent {
  consentId: string;
  pispId: string;
  eventType: "GRANTED" | "REVOKED" | "EXPIRED" | "TRANSFER_INITIATED";
  dfspId: string;
  timestamp: string;
}

export interface FluvioParticipantEvent {
  participantId: string;
  dfspId: string;
  eventType: "ONBOARDED" | "SUSPENDED" | "REACTIVATED" | "OFFBOARDED" | "LIMIT_UPDATED";
  status: string;
  timestamp: string;
}

export interface FluvioCbdcEvent {
  accountId: string;
  eventType: "ACCOUNT_CREATED" | "TRANSFER_INITIATED" | "TRANSFER_COMPLETED";
  amount?: number;
  currency: string;
  timestamp: string;
}

export interface FluvioSecurityAlert {
  alertId: string;
  alertType: string;
  severity: "low" | "medium" | "high" | "critical";
  dfspId?: string;
  description: string;
  timestamp: string;
}

export const nexthubFluvioPublish = {
  ndcBreachAlert: (e: FluvioNdcBreachAlert) =>
    publishFluvioEvent(NEXTHUB_FLUVIO_TOPICS.NDC_BREACH_ALERTS, e, e.dfspId),

  fxRateTick: (e: FluvioFxRateTick) =>
    publishFluvioEvent(NEXTHUB_FLUVIO_TOPICS.FX_RATE_TICKS, e, `${e.sourceCurrency}/${e.targetCurrency}`),

  settlementUpdate: (e: FluvioSettlementUpdate) =>
    publishFluvioEvent(NEXTHUB_FLUVIO_TOPICS.SETTLEMENT_UPDATES, e, e.windowId),

  transferStateChange: (e: FluvioTransferStateChange) =>
    publishFluvioEvent(NEXTHUB_FLUVIO_TOPICS.TRANSFER_STATE_CHANGES, e, e.transferId),

  disputeUpdate: (e: FluvioDisputeUpdate) =>
    publishFluvioEvent(NEXTHUB_FLUVIO_TOPICS.DISPUTE_UPDATES, e, e.disputeId),

  pispEvent: (e: FluvioPispEvent) =>
    publishFluvioEvent(NEXTHUB_FLUVIO_TOPICS.PISP_EVENTS, e, e.consentId),

  participantEvent: (e: FluvioParticipantEvent) =>
    publishFluvioEvent(NEXTHUB_FLUVIO_TOPICS.PARTICIPANT_EVENTS, e, e.participantId),

  cbdcEvent: (e: FluvioCbdcEvent) =>
    publishFluvioEvent(NEXTHUB_FLUVIO_TOPICS.CBDC_EVENTS, e, e.accountId),

  securityAlert: (e: FluvioSecurityAlert) =>
    publishFluvioEvent(NEXTHUB_FLUVIO_TOPICS.SECURITY_ALERTS, e, e.alertId),
};
