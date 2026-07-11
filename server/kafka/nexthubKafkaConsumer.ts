/**
 * nexthubKafkaConsumer.ts — NextHub Kafka Consumer
 * ─────────────────────────────────────────────────────────────────────────────
 * Consumes events produced by Paygate and materialises them into NextHub's
 * read-model tables so the Regulator Portal and Analytics can query them
 * without direct access to the Paygate database.
 *
 * Consumer Groups:
 *   nexthub-audit-consumer     → paygate.audit.v1
 *   nexthub-corridor-consumer  → paygate.corridor.volume.v1
 */

import { ENV } from "../_core/env";
import { getDb } from "../db";
import { auditLogs } from "../../drizzle/nexthub_schema";
import { sql } from "drizzle-orm";
import { NEXTHUB_KAFKA_TOPICS } from "./nexthubKafkaProducer";

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
    console.warn("[nexthub-kafka-consumer] kafkajs not available");
    return null;
  }
}

// ─── Paygate Audit Consumer ───────────────────────────────────────────────────
// Materialises Paygate transaction events into nexthub audit_logs so the
// Regulator Portal can display them without a direct DB link to Paygate.
async function startAuditConsumer() {
  const kafka = await getKafka();
  if (!kafka) return;

  const consumer = kafka.consumer({ groupId: "nexthub-audit-consumer" });
  await consumer.connect();
  await consumer.subscribe({
    topic: NEXTHUB_KAFKA_TOPICS.PAYGATE_AUDIT,
    fromBeginning: false,
  });

  console.log("[nexthub-kafka-consumer] Audit consumer started");

  await consumer.run({
    eachBatch: async ({ batch }: any) => {
      const db = await getDb();
      if (!db) return;

      const rows = batch.messages
        .map((msg: any) => {
          try {
            return JSON.parse(msg.value.toString());
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      if (rows.length === 0) return;

      // Batch upsert into audit_logs
      for (const row of rows) {
        try {
          await db.insert(auditLogs).values({
            id: row.entityId ?? crypto.randomUUID(),
            merchantId: row.merchantId ?? null,
            action: row.eventType ?? "UNKNOWN",
            resource: row.entityType ?? "paygate_transaction",
            resourceId: row.entityId ?? null,
            metadata: JSON.stringify(row),
            createdAt: row.timestamp ? new Date(row.timestamp) : new Date(),
          }).onConflictDoNothing();
        } catch (err) {
          console.error("[nexthub-audit-consumer] Insert error:", err);
        }
      }

      console.log(`[nexthub-audit-consumer] Materialised ${rows.length} audit events`);
    },
  });

  return consumer;
}

// ─── Corridor Volume Consumer ─────────────────────────────────────────────────
// Ingests Paygate corridor volume aggregates for the CorridorLiveStatsV2 page.
// Stored in a lightweight in-memory cache (Redis in production).
const corridorVolumeCache = new Map<string, { data: any; updatedAt: number }>();

async function startCorridorVolumeConsumer() {
  const kafka = await getKafka();
  if (!kafka) return;

  const consumer = kafka.consumer({ groupId: "nexthub-corridor-consumer" });
  await consumer.connect();
  await consumer.subscribe({
    topic: NEXTHUB_KAFKA_TOPICS.PAYGATE_CORRIDOR_VOL,
    fromBeginning: false,
  });

  console.log("[nexthub-kafka-consumer] Corridor volume consumer started");

  await consumer.run({
    eachMessage: async ({ message }: any) => {
      try {
        const payload = JSON.parse(message.value.toString());
        const key = `${payload.payerFspId}→${payload.payeeFspId}:${payload.currency}`;
        corridorVolumeCache.set(key, { data: payload, updatedAt: Date.now() });
      } catch (err) {
        console.error("[nexthub-corridor-consumer] Parse error:", err);
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
    await Promise.all([
      startAuditConsumer(),
      startCorridorVolumeConsumer(),
    ]);
    console.log("[nexthub-kafka-consumer] All consumers running");
  } catch (err) {
    console.error("[nexthub-kafka-consumer] Failed to start consumers:", err);
  }
}
