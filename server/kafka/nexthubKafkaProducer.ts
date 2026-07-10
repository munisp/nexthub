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
  NDC_BREACH:            "nexthub.ndc.breach.v1",
  SETTLEMENT_CLOSED:     "nexthub.settlement.closed.v1",
  SETTLEMENT_SETTLED:    "nexthub.settlement.settled.v1",
  PARTICIPANT_STATUS:    "nexthub.participant.status.v1",

  // Paygate → NextHub (consumed here)
  PAYGATE_AUDIT:         "paygate.audit.v1",
  PAYGATE_CORRIDOR_VOL:  "paygate.corridor.volume.v1",
} as const;

// ─── Typed event payloads ─────────────────────────────────────────────────────
export interface TransferReceivedEvent {
  transferId: string;
  payerFspId: string;
  payeeFspId: string;
  amountKobo: number;
  currency: string;
  state: string;
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

export interface SettlementClosedEvent {
  windowId: string;
  currency: string;
  totalTransfers: number;
  totalAmountKobo: number;
  closedAt: string;
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
    _producer = kafka.producer({ maxInFlightRequests: 5, idempotent: true });
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

  settlementClosed: (e: SettlementClosedEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.SETTLEMENT_CLOSED, e, e.windowId),

  settlementSettled: (e: SettlementSettledEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.SETTLEMENT_SETTLED, e, e.windowId),

  participantStatus: (e: ParticipantStatusEvent) =>
    publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.PARTICIPANT_STATUS, e, e.dfspId),
};

// ─── Graceful shutdown ────────────────────────────────────────────────────────
export async function disconnectKafkaProducer() {
  if (_producer && _producerConnected) {
    await _producer.disconnect();
    _producerConnected = false;
    console.log("[nexthub-kafka] Producer disconnected");
  }
}
