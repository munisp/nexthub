/**
 * nexthubKafkaConsumer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Kafka consumers for the NextHub platform.
 *
 * Consumer Groups:
 *   nexthub-audit-consumer     → paygate.audit.v1
 *   nexthub-corridor-consumer  → paygate.corridor.volume.v1
 *   nexthub-dlq-monitor        → nexthub.dlq.v1  (alert-only)
 *
 * Dead-letter queue (DLQ):
 *   Any message that fails after MAX_RETRIES is published to nexthub.dlq.v1
 *   with the original topic, partition, offset, error, and payload for replay.
 *
 * Structured logging:
 *   All events use the shared Winston logger.
 */

import { ENV } from "../_core/env";
import { getDb } from "../db";
import { auditLogs } from "../../drizzle/nexthub_schema";
import { NEXTHUB_KAFKA_TOPICS } from "./nexthubKafkaProducer";
import { logger } from "../logger";

const MAX_RETRIES = 3;
const DLQ_TOPIC = "nexthub.dlq.v1";

// ─── Lazy Kafka factory ───────────────────────────────────────────────────────
async function getKafka() {
  const brokers = (ENV as any).kafkaBootstrapServers;
  if (!brokers) return null;
  try {
    const { Kafka } = await import("kafkajs" as any);
    return new Kafka({
      clientId: "nexthub-core-consumer",
      brokers: brokers.split(",").map((b: string) => b.trim()),
      ssl: brokers.includes("ssl://"),
      retry: { initialRetryTime: 300, retries: 8 },
    });
  } catch {
    logger.warn("[nexthub-kafka-consumer] kafkajs not available — consumers disabled");
    return null;
  }
}

// ─── Dead-Letter Queue publisher ─────────────────────────────────────────────
async function publishToDlq(
  producer: any,
  originalTopic: string,
  partition: number,
  offset: string,
  errorMessage: string,
  originalPayload: string,
) {
  if (!producer) return;
  try {
    await producer.send({
      topic: DLQ_TOPIC,
      messages: [
        {
          key: `${originalTopic}:${partition}:${offset}`,
          value: JSON.stringify({
            originalTopic,
            partition,
            offset,
            errorMessage,
            originalPayload,
            failedAt: new Date().toISOString(),
          }),
        },
      ],
    });
    logger.warn("[nexthub-dlq] Message published to DLQ", {
      originalTopic, partition, offset, errorMessage,
    });
  } catch (dlqErr: any) {
    logger.error("[nexthub-dlq] CRITICAL: Failed to publish to DLQ", {
      originalTopic, partition, offset, dlqError: dlqErr?.message,
    });
  }
}

// ─── Retry wrapper ────────────────────────────────────────────────────────────
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  label: string,
): Promise<{ ok: true; result: T } | { ok: false; error: Error }> {
  let lastError: Error = new Error("Unknown error");
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      return { ok: true, result };
    } catch (err: any) {
      lastError = err;
      logger.warn(`[${label}] Attempt ${attempt}/${maxRetries} failed`, { error: err?.message });
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 200 * attempt));
      }
    }
  }
  return { ok: false, error: lastError };
}

// ─── Paygate Audit Consumer ───────────────────────────────────────────────────
async function startAuditConsumer(dlqProducer: any) {
  const kafka = await getKafka();
  if (!kafka) return;

  const consumer = kafka.consumer({ groupId: "nexthub-audit-consumer" });
  await consumer.connect();
  await consumer.subscribe({
    topic: NEXTHUB_KAFKA_TOPICS.PAYGATE_AUDIT,
    fromBeginning: false,
  });
  logger.info("[nexthub-kafka-consumer] Audit consumer started");

  await consumer.run({
    eachBatch: async ({ batch }: any) => {
      const db = await getDb();
      if (!db) return;

      for (const msg of batch.messages) {
        const rawValue = msg.value?.toString() ?? "";
        const res = await withRetry(async () => {
          let row: any;
          try { row = JSON.parse(rawValue); } catch { throw new Error("JSON parse failure"); }
          await db.insert(auditLogs).values({
            id: row.entityId ?? crypto.randomUUID(),
            merchantId: row.merchantId ?? null,
            action: row.eventType ?? "UNKNOWN",
            resource: row.entityType ?? "paygate_transaction",
            resourceId: row.entityId ?? null,
            metadata: JSON.stringify(row),
            createdAt: row.timestamp ? new Date(row.timestamp) : new Date(),
          }).onConflictDoNothing();
        }, MAX_RETRIES, "nexthub-audit-consumer");

        if (!res.ok) {
          await publishToDlq(
            dlqProducer,
            NEXTHUB_KAFKA_TOPICS.PAYGATE_AUDIT,
            batch.partition,
            msg.offset,
            res.error.message,
            rawValue,
          );
        }
      }

      logger.info("[nexthub-audit-consumer] Batch processed", {
        count: batch.messages.length,
        partition: batch.partition,
      });
    },
  });

  return consumer;
}

// ─── Corridor Volume Consumer ─────────────────────────────────────────────────
const corridorVolumeCache = new Map<string, { data: any; updatedAt: number }>();

async function startCorridorVolumeConsumer(dlqProducer: any) {
  const kafka = await getKafka();
  if (!kafka) return;

  const consumer = kafka.consumer({ groupId: "nexthub-corridor-consumer" });
  await consumer.connect();
  await consumer.subscribe({
    topic: NEXTHUB_KAFKA_TOPICS.PAYGATE_CORRIDOR_VOL,
    fromBeginning: false,
  });
  logger.info("[nexthub-kafka-consumer] Corridor volume consumer started");

  await consumer.run({
    eachMessage: async ({ message, partition, topic }: any) => {
      const rawValue = message.value?.toString() ?? "";
      const res = await withRetry(async () => {
        const payload = JSON.parse(rawValue);
        const key = `${payload.payerFspId}→${payload.payeeFspId}:${payload.currency}`;
        corridorVolumeCache.set(key, { data: payload, updatedAt: Date.now() });
      }, MAX_RETRIES, "nexthub-corridor-consumer");

      if (!res.ok) {
        await publishToDlq(dlqProducer, topic, partition, message.offset, res.error.message, rawValue);
      }
    },
  });

  return consumer;
}

// ─── DLQ Monitor Consumer ─────────────────────────────────────────────────────
// Logs DLQ messages for alerting. In production, attach a Winston transport
// to forward these to PagerDuty / Slack via the logger.
async function startDlqMonitorConsumer() {
  const kafka = await getKafka();
  if (!kafka) return;

  const consumer = kafka.consumer({ groupId: "nexthub-dlq-monitor" });
  await consumer.connect();
  await consumer.subscribe({ topic: DLQ_TOPIC, fromBeginning: false });
  logger.info("[nexthub-kafka-consumer] DLQ monitor consumer started");

  await consumer.run({
    eachMessage: async ({ message }: any) => {
      try {
        const dlqEntry = JSON.parse(message.value?.toString() ?? "{}");
        logger.error("[nexthub-dlq] Dead-lettered message detected", {
          originalTopic: dlqEntry.originalTopic,
          partition: dlqEntry.partition,
          offset: dlqEntry.offset,
          errorMessage: dlqEntry.errorMessage,
          failedAt: dlqEntry.failedAt,
        });
      } catch {
        // ignore parse errors in DLQ monitor itself
      }
    },
  });

  return consumer;
}

// ─── Exported cache accessor ──────────────────────────────────────────────────
export function getCorridorVolumeCache() {
  return corridorVolumeCache;
}

// ─── Start all consumers ──────────────────────────────────────────────────────
let _started = false;

export async function startAllConsumers() {
  if (_started) return;
  _started = true;
  try {
    const kafka = await getKafka();
    let dlqProducer: any = null;
    if (kafka) {
      dlqProducer = kafka.producer();
      await dlqProducer.connect();
      logger.info("[nexthub-kafka-consumer] DLQ producer connected");
    }

    await Promise.all([
      startAuditConsumer(dlqProducer),
      startCorridorVolumeConsumer(dlqProducer),
      startDlqMonitorConsumer(),
    ]);
    logger.info("[nexthub-kafka-consumer] All consumers running");
  } catch (err: any) {
    logger.error("[nexthub-kafka-consumer] Failed to start consumers", { error: err?.message });
  }
}
